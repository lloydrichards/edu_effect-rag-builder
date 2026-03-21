import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  CHUNK_SIZE,
  type FileUploadEntry,
  MAX_FILE_SIZE,
  type UploadChunk,
} from "@repo/domain/Upload";
import { Effect, Stream } from "effect";
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

type UploadAck = {
  readonly ok: true;
  readonly status: "chunk-received" | "ingest-complete" | "ingest-failed";
};

const sendChunk = (
  chunk: UploadChunk,
): Effect.Effect<UploadAck, unknown, RpcClient> =>
  Effect.gen(function* () {
    const rpc = yield* RpcClient;
    return yield* rpc.client.uploadChunk(chunk);
  });

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
      readonly status: "complete" | "error";
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
                        event.status === "complete" ? "complete" : "error",
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
  Stream.concat(
    Stream.fromIterable<UploadEvent>([
      { _tag: "status", id: entry.id, status: "reading" },
    ]),
    Stream.fromEffect(
      Effect.result(
        Effect.gen(function* () {
          const events: UploadEvent[] = [
            { _tag: "status", id: entry.id, status: "uploading" },
          ];

          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const blob = file.slice(start, end);
            const data = yield* Effect.promise(() => readChunkAsBase64(blob));

            const ack = yield* sendChunk({
              fileId: entry.id,
              fileName: file.name,
              chunkIndex: i,
              totalChunks,
              data,
            });

            if (ack.status === "ingest-complete") {
              events.push({ _tag: "ingest", id: entry.id, status: "complete" });
            } else if (ack.status === "ingest-failed") {
              events.push({ _tag: "ingest", id: entry.id, status: "error" });
            }

            events.push({
              _tag: "progress",
              id: entry.id,
              chunksUploaded: i + 1,
              progress: Math.round(((i + 1) / totalChunks) * 100),
            });
          }

          return events;
        }),
      ),
    ).pipe(
      Stream.flatMap((result) =>
        result._tag === "Success"
          ? Stream.fromIterable(result.success)
          : Stream.fromIterable<UploadEvent>([
              {
                _tag: "status",
                id: entry.id,
                status: "error",
                error:
                  result.failure instanceof Error
                    ? result.failure.message
                    : String(result.failure),
              },
            ]),
      ),
    ),
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
