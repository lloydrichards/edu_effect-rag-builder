import type { UploadIngestEvent } from "@repo/domain/Upload";
import { ChunkService, RagService } from "@repo/rag";
import {
  Array,
  type Cause,
  Effect,
  Layer,
  Queue,
  Ref,
  ServiceMap,
} from "effect";

const COLLECTION_NAME = "uploads";
const INGEST_BATCH_SIZE = 1000;
const PREVIEW_MAX_LENGTH = 180;

type UploadEntry = {
  fileName: string;
  totalChunks: number;
  chunks: Map<number, string>;
};

export class UploadIngestService extends ServiceMap.Service<UploadIngestService>()(
  "UploadIngestService",
  {
    make: Effect.gen(function* () {
      const rag = yield* RagService;
      const chunker = yield* ChunkService;
      const uploadsRef = yield* Ref.make(new Map<string, UploadEntry>());

      const handleChunk = Effect.fn("handleChunk")(function* ({
        fileId,
        fileName,
        chunkIndex,
        totalChunks,
        data,
      }) {
        const queue = yield* Queue.unbounded<
          typeof UploadIngestEvent.Type,
          Cause.Done
        >();
        const current = yield* Ref.get(uploadsRef);
        const entry: UploadEntry = current.get(fileId) ?? {
          fileName,
          totalChunks,
          chunks: new Map<number, string>(),
        };

        entry.chunks.set(chunkIndex, data);

        const next = new Map(current);
        next.set(fileId, entry);
        yield* Ref.set(uploadsRef, next);

        if (entry.chunks.size < totalChunks) {
          yield* Queue.offer(queue, {
            _tag: "chunk-received",
            id: fileId,
            chunkIndex,
          });
          yield* Queue.end(queue);
          return queue;
        }

        const ingestEffect = Effect.gen(function* () {
          const buffers: Buffer[] = [];
          for (let index = 0; index < totalChunks; index++) {
            const part = entry.chunks.get(index);
            if (!part) {
              throw new Error(`Missing chunk ${index} for ${fileId}`);
            }
            buffers.push(Buffer.from(part, "base64"));
          }

          const contentBuffer = Buffer.concat(buffers);
          const extracted = yield* chunker.extractText(fileName, contentBuffer);
          const contentChunks = chunker.chunkText(
            fileName,
            extracted.text,
            extracted.pages,
          );

          if (contentChunks.length === 0) {
            yield* Effect.log(
              `Upload ingest complete: ${fileName} (0 chunks, ${contentBuffer.length} bytes)`,
            );
            yield* Queue.offer(queue, {
              _tag: "ingest-start",
              id: fileId,
            });
            yield* Queue.offer(queue, {
              _tag: "ingest-complete",
              id: fileId,
              total: 0,
            });
            yield* Queue.end(queue);
            return;
          }

          const mimeType = chunker.resolveMimeType(
            chunker.getFileExtension(fileName),
          );

          const documents = contentChunks.map((chunk, index) => ({
            collection: COLLECTION_NAME,
            id: `${fileId}-${index}`,
            document: chunk.text,
            metadata: {
              fileId,
              fileName,
              mimeType,
              chunkIndex: index,
              totalChunks: contentChunks.length,
              ...(chunk.pageNumber !== undefined
                ? { pageNumber: chunk.pageNumber }
                : {}),
              ...(chunk.pageCount !== undefined
                ? { pageCount: chunk.pageCount }
                : {}),
            },
          }));

          const chunks = Array.chunksOf(documents, INGEST_BATCH_SIZE);

          const chunkPreview = chunker.truncatePreview(
            contentChunks[0]?.text ?? "",
            PREVIEW_MAX_LENGTH,
          );

          yield* Effect.log(
            `Starting ingest for ${fileName}: ${contentChunks.length} chunks in ${chunks.length} batches (${contentBuffer.length} bytes, first chunk preview: "${chunkPreview}")`,
          );
          yield* Queue.offer(queue, {
            _tag: "ingest-start",
            id: fileId,
          });
          yield* Effect.forEach(
            chunks,
            (batch, batchIndex) =>
              rag
                .ingest({
                  collection: COLLECTION_NAME,
                  ids: batch.map((d) => d.id),
                  documents: batch.map((d) => d.document),
                  metadatas: batch.map((d) => d.metadata),
                })
                .pipe(
                  Effect.tap(() =>
                    Queue.offer(queue, {
                      _tag: "ingest-progress",
                      id: fileId,

                      processed: Math.min(
                        (batchIndex + 1) * INGEST_BATCH_SIZE,
                        contentChunks.length,
                      ),
                      total: contentChunks.length,
                    }),
                  ),
                ),
            {
              concurrency: 1,
            },
          );

          yield* Effect.log(
            `Upload ingest complete: ${fileName} (${contentChunks.length} chunks)`,
          );
          yield* Queue.offer(queue, {
            _tag: "ingest-complete",
            id: fileId,
            total: contentChunks.length,
          });
          yield* Queue.end(queue);
        });

        yield* Queue.offer(queue, {
          _tag: "chunk-received",
          id: fileId,
          chunkIndex,
        });

        const runIngest = ingestEffect.pipe(
          Effect.ensuring(
            Ref.update(uploadsRef, (map) => {
              const updated = new Map(map);
              updated.delete(fileId);
              return updated;
            }),
          ),
          Effect.tapError((error) =>
            chunker.logIngestError(fileName, fileId, error),
          ),
          Effect.tapError((error) =>
            Queue.offer(queue, {
              _tag: "ingest-failed",
              id: fileId,
              message:
                error instanceof Error
                  ? error.message
                  : globalThis.String(error),
            }),
          ),
          Effect.catch(() => Effect.void),
          Effect.ensuring(Queue.end(queue)),
        );

        yield* Effect.forkScoped(runIngest);
        return queue;
      });

      return { handleChunk } as const;
    }).pipe(Effect.provide(ChunkService.Default)),
  },
) {
  static Default = Layer.effect(UploadIngestService)(UploadIngestService.make);
}
