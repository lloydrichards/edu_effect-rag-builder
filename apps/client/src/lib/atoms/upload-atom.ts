import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  CHUNK_SIZE,
  type FileUploadEntry,
  MAX_FILE_SIZE,
  type UploadChunk,
  type UploadIngestEvent,
} from "@repo/domain/Upload";
import { Effect, Queue, Stream } from "effect";
import { runtime } from "../atom";
import { RpcClient } from "../rpc-client";

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const isAcceptedFile = (file: File): boolean => {
  if (
    ACCEPTED_MIME_TYPES.includes(
      file.type as (typeof ACCEPTED_MIME_TYPES)[number],
    )
  ) {
    return true;
  }
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  return ACCEPTED_EXTENSIONS.includes(
    ext as (typeof ACCEPTED_EXTENSIONS)[number],
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const ingestShareForSize = (bytes: number) => {
  const sizeMb = Math.max(bytes / (1024 * 1024), 0.0001);
  const share = 0.5 + 0.2 * Math.log10(sizeMb / 0.025);
  return clamp(share, 0.5, 0.9);
};

const readChunkAsBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

type RpcClientService = RpcClient["Service"];

const sendChunk = (
  rpc: RpcClientService,
  chunk: UploadChunk,
): Stream.Stream<typeof UploadIngestEvent.Type> =>
  rpc.client.uploadChunk(chunk).pipe(Stream.catch(() => Stream.empty));

export type UploadState = {
  readonly files: readonly FileUploadEntry[];
};

type UploadEvent =
  | {
      readonly _tag: "status";
      readonly id: string;
      readonly status: FileUploadEntry["status"];
      readonly error?: string;
    }
  | {
      readonly _tag: "progress";
      readonly id: string;
      readonly chunksUploaded: number;
      readonly progress: number;
    }
  | {
      readonly _tag: "ingest";
      readonly id: string;
      readonly status: "start" | "complete" | "error";
    };

export const uploadAtom = runtime.fn((files: readonly File[]) => {
  const validated = files.filter(isAcceptedFile);

  if (validated.length === 0) {
    return Stream.fromIterable<UploadState>([
      {
        files: files.map((f) => ({
          id: generateId(),
          name: f.name,
          size: f.size,
          type: f.type,
          status: "error" as const,
          progress: 0,
          error: "Unsupported file type",
          chunksTotal: 0,
          chunksUploaded: 0,
        })),
      },
    ]);
  }

  const entries: FileUploadEntry[] = validated.map((file) => ({
    id: generateId(),
    name: file.name,
    size: file.size,
    type: file.type,
    status: "pending" as const,
    progress: 0,
    chunksTotal: Math.ceil(file.size / CHUNK_SIZE),
    chunksUploaded: 0,
  }));

  const fileStreams = entries.map((entry, idx) =>
    uploadFile(entry, validated[idx]!),
  );

  const eventStream = Stream.mergeAll(fileStreams, { concurrency: 3 });

  return eventStream.pipe(
    Stream.scan(
      { files: entries } satisfies UploadState,
      (state, event): UploadState => {
        switch (event._tag) {
          case "status":
            return {
              files: state.files.map((f) =>
                f.id === event.id
                  ? { ...f, status: event.status, error: event.error }
                  : f,
              ),
            };
          case "progress":
            return {
              files: state.files.map((f) =>
                f.id === event.id
                  ? {
                      ...f,
                      chunksUploaded: event.chunksUploaded,
                      progress: event.progress,
                    }
                  : f,
              ),
            };
          case "ingest":
            return {
              files: state.files.map((f) =>
                f.id === event.id
                  ? {
                      ...f,
                      status:
                        event.status === "complete"
                          ? "complete"
                          : event.status === "error"
                            ? "error"
                            : f.status,
                      ingesting: event.status === "start",
                      error:
                        event.status === "error"
                          ? "Ingest failed. Check server logs."
                          : f.error,
                    }
                  : f,
              ),
            };
        }
      },
    ),
  );
});

const uploadFile = (
  entry: FileUploadEntry,
  file: File,
): Stream.Stream<UploadEvent, never, RpcClient> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const rpc = yield* RpcClient;

      return Stream.concat(
        Stream.fromIterable<UploadEvent>([
          { _tag: "status", id: entry.id, status: "reading" },
          { _tag: "status", id: entry.id, status: "uploading" },
        ]),
        Stream.callback<UploadEvent>((queue) =>
          Effect.gen(function* () {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const ingestShare = ingestShareForSize(file.size);
            const uploadShare = 1 - ingestShare;
            const uploadSharePct = Math.round(uploadShare * 100);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const blob = file.slice(start, end);
              const data = yield* Effect.promise(() => readChunkAsBase64(blob));

              const uploadProgress = Math.round(
                ((i + 1) / totalChunks) * uploadSharePct,
              );
              yield* Queue.offer(queue, {
                _tag: "progress",
                id: entry.id,
                chunksUploaded: i + 1,
                progress: Math.min(uploadProgress, uploadSharePct),
              });

              yield* sendChunk(rpc, {
                fileId: entry.id,
                fileName: file.name,
                chunkIndex: i,
                totalChunks,
                data,
              }).pipe(
                Stream.runForEach((ingestEvent) =>
                  Effect.gen(function* () {
                    switch (ingestEvent._tag) {
                      case "ingest-start": {
                        yield* Queue.offer(queue, {
                          _tag: "ingest",
                          id: entry.id,
                          status: "start",
                        });
                        break;
                      }
                      case "ingest-progress": {
                        yield* Queue.offer(queue, {
                          _tag: "ingest",
                          id: entry.id,
                          status: "start",
                        });
                        const progress =
                          ingestEvent.total > 0
                            ? Math.round(
                                uploadSharePct +
                                  ingestShare *
                                    100 *
                                    (ingestEvent.processed / ingestEvent.total),
                              )
                            : 100;
                        yield* Queue.offer(queue, {
                          _tag: "progress",
                          id: entry.id,
                          chunksUploaded: i + 1,
                          progress: Math.min(progress, 100),
                        });
                        break;
                      }
                      case "ingest-complete": {
                        yield* Queue.offer(queue, {
                          _tag: "ingest",
                          id: entry.id,
                          status: "complete",
                        });
                        yield* Queue.offer(queue, {
                          _tag: "progress",
                          id: entry.id,
                          chunksUploaded: i + 1,
                          progress: 100,
                        });
                        break;
                      }
                      case "ingest-failed": {
                        yield* Queue.offer(queue, {
                          _tag: "ingest",
                          id: entry.id,
                          status: "error",
                        });
                        break;
                      }
                      default:
                        break;
                    }
                  }),
                ),
              );
            }

            yield* Queue.end(queue);
          }).pipe(
            Effect.catch((error: unknown) =>
              Effect.gen(function* () {
                const message =
                  error instanceof Error ? error.message : String(error);
                yield* Queue.offer(queue, {
                  _tag: "status",
                  id: entry.id,
                  status: "error",
                  error: message,
                });
                yield* Queue.end(queue);
              }),
            ),
          ),
        ),
      );
    }),
  );

export const validateFiles = (
  files: FileList | File[],
): { valid: File[]; rejected: string[] } => {
  const fileArray = Array.from(files);
  const valid: File[] = [];
  const rejected: string[] = [];

  for (const file of fileArray) {
    if (file.size > MAX_FILE_SIZE) {
      rejected.push(
        `${file.name}: exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      );
    } else if (!isAcceptedFile(file)) {
      rejected.push(`${file.name}: unsupported file type`);
    } else {
      valid.push(file);
    }
  }

  return { valid, rejected };
};
