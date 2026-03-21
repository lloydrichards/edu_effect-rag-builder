import type { UploadChunk } from "@repo/domain/Upload";
import { RagService } from "@repo/rag";
import { Array, Effect, Layer, Ref, ServiceMap } from "effect";
import { EmbeddingModel } from "effect/unstable/ai";

const COLLECTION_NAME = "uploads";
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_BATCH_SIZE = 200;

type UploadEntry = {
  fileName: string;
  totalChunks: number;
  chunks: Map<number, string>;
};

const chunkText = (text: string): string[] => {
  if (text.length === 0) {
    return [];
  }

  const overlap = Math.min(CHUNK_OVERLAP, Math.floor(CHUNK_SIZE / 2));
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }

  return chunks;
};

const getFileExtension = (fileName: string) => {
  const parts = fileName.split(".");
  if (parts.length < 2) {
    return "";
  }
  return `.${parts.at(-1)?.toLowerCase()}`;
};

const resolveMimeType = (extension: string) => {
  switch (extension) {
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
};

const extractText = (fileName: string, buffer: Buffer) => {
  const extension = getFileExtension(fileName);
  switch (extension) {
    case ".txt":
    case ".md":
    case ".csv":
      return buffer.toString("utf8");
    default:
      throw new Error(`Unsupported file type: ${fileName}`);
  }
};

export class UploadIngestService extends ServiceMap.Service<UploadIngestService>()(
  "UploadIngestService",
  {
    make: Effect.gen(function* () {
      const rag = yield* RagService;
      const embeddingModel = yield* EmbeddingModel.EmbeddingModel;
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
          const contentText = extractText(fileName, contentBuffer);
          const contentChunks = chunkText(contentText);

          if (contentChunks.length === 0) {
            yield* Effect.log(`Upload ingest complete: ${fileName} (0 chunks)`);
            return { ok: true, status: "ingest-complete" } as const;
          }

          const batchResponses = yield* Effect.forEach(
            Array.chunksOf(contentChunks, EMBEDDING_BATCH_SIZE),
            (batch) => embeddingModel.embedMany(batch),
            { concurrency: 1 },
          );
          const vectors = batchResponses.flatMap((response) =>
            response.embeddings.map((embedding) => [...embedding.vector]),
          );
          const mimeType = resolveMimeType(getFileExtension(fileName));

          yield* rag.ingest({
            collection: COLLECTION_NAME,
            ids: contentChunks.map((_, index) => `${fileId}:${index}`),
            embeddings: vectors,
            documents: contentChunks,
            metadatas: contentChunks.map((_, index) => ({
              fileId,
              fileName,
              mimeType,
              chunkIndex: index,
              totalChunks: contentChunks.length,
            })),
          });

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
            Effect.logError(
              `Upload ingest failed for ${fileName}: ${String(error)}`,
            ),
          ),
          Effect.orElseSucceed(
            () => ({ ok: true, status: "ingest-failed" }) as const,
          ),
        );
      });

      return { handleChunk } as const;
    }),
  },
) {
  static Default = Layer.effect(UploadIngestService)(UploadIngestService.make);
}
