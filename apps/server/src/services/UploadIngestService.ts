import type { UploadChunk } from "@repo/domain/Upload";
import { RagService } from "@repo/rag";
import { Array, Effect, Layer, Ref, ServiceMap } from "effect";

const COLLECTION_NAME = "uploads";
const INGEST_BATCH_SIZE = 1000;
const PREVIEW_MAX_LENGTH = 180;

type UploadEntry = {
  fileName: string;
  totalChunks: number;
  chunks: Map<number, string>;
};

const splitSentences = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const matches = normalized.match(/[^.!?]+(?:[.!?]+|$)/g);
  if (!matches) {
    return [];
  }

  return matches.map((sentence) => sentence.trim()).filter(Boolean);
};

const splitLines = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const chunkText = (fileName: string, text: string): string[] => {
  const extension = getFileExtension(fileName);
  switch (extension) {
    case ".csv":
      return splitLines(text);
    case ".txt":
    case ".md":
      return splitSentences(text);
    default:
      return [];
  }
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

const truncatePreview = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const logIngestError = (fileName: string, fileId: string, error: unknown) => {
  if (error instanceof Error) {
    return Effect.logError(
      `Upload ingest failed for ${fileName} (ID: ${fileId}): ${error.name}: ${error.message}`,
    );
  }

  let serialized: string | null = null;
  try {
    serialized = JSON.stringify(error);
  } catch {
    serialized = null;
  }

  return Effect.logError(
    `Upload ingest failed for ${fileName} (ID: ${fileId}): ${serialized ?? String(error)}`,
  );
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
          const contentChunks = chunkText(fileName, contentText);

          if (contentChunks.length === 0) {
            yield* Effect.log(
              `Upload ingest complete: ${fileName} (0 chunks, ${contentBuffer.length} bytes)`,
            );
            return { ok: true, status: "ingest-complete" } as const;
          }

          const mimeType = resolveMimeType(getFileExtension(fileName));

          const documents = contentChunks.map((c, index) => ({
            collection: COLLECTION_NAME,
            id: `${fileId}-${index}`,
            document: c,
            metadata: {
              fileId,
              fileName,
              mimeType,
              chunkIndex: index,
              totalChunks: contentChunks.length,
            },
          }));

          const chunks = Array.chunksOf(documents, INGEST_BATCH_SIZE);

          const chunkPreview = truncatePreview(
            contentChunks[0] ?? "",
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
          Effect.tapError((error) => logIngestError(fileName, fileId, error)),
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
