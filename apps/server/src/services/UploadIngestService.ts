import type { UploadChunk } from "@repo/domain/Upload";
import { ChunkService, RagService } from "@repo/rag";
import { Array, Effect, Layer, Ref, ServiceMap } from "effect";

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
      }: typeof UploadChunk.Type) {
        const current = yield* Ref.get(uploadsRef);
        yield* Effect.log(
          `Received chunk ${chunkIndex + 1}/${totalChunks} for file ${fileName} (ID: ${fileId})`,
        );
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
          return { ok: true, status: "chunk-received" } as const;
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
            return { ok: true, status: "ingest-complete" } as const;
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
          yield* Effect.forEach(
            chunks,
            (batch) =>
              rag.ingest({
                collection: COLLECTION_NAME,
                ids: batch.map((d) => d.id),
                documents: batch.map((d) => d.document),
                metadatas: batch.map((d) => d.metadata),
              }),
            {
              concurrency: 1,
            },
          );

          yield* Effect.log(
            `Upload ingest complete: ${fileName} (${contentChunks.length} chunks)`,
          );

          return { ok: true, status: "ingest-complete" } as const;
        });

        return yield* ingestEffect.pipe(
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
          Effect.orElseSucceed(
            () => ({ ok: true, status: "ingest-failed" }) as const,
          ),
        );
      });

      return { handleChunk } as const;
    }).pipe(Effect.provide(ChunkService.Default)),
  },
) {
  static Default = Layer.effect(UploadIngestService)(UploadIngestService.make);
}
