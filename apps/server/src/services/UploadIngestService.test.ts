import { describe, expect, it } from "@effect/vitest";
import { type RagHit, RagService } from "@repo/rag";
import { type Cause, Effect, Layer, Queue } from "effect";
import { UploadIngestService } from "./UploadIngestService";

const TestRagService = Layer.succeed(RagService, {
  ingest: Effect.fn("ingest")(
    (input: { readonly ids: ReadonlyArray<string> }) =>
      Effect.succeed({ count: input.ids.length } as const),
  ),
  retrieve: Effect.fn("retrieve")(() =>
    Effect.succeed({ hits: [] as RagHit[] } as const),
  ),
  listDocuments: Effect.fn("listDocuments")(() =>
    Effect.succeed({ documents: [] } as const as any),
  ),
});

const UploadIngestTestLayer = UploadIngestService.Default.pipe(
  Layer.provide(TestRagService),
);

const takeAll = (queue: Queue.Queue<unknown, Cause.Done>) =>
  Effect.gen(function* () {
    const results = yield* Queue.takeAll(queue);
    return Array.from(results);
  });

describe("UploadIngestService", () => {
  it.effect("streams chunk-received and ends when upload incomplete", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const uploadIngest = yield* UploadIngestService;

        const result = yield* uploadIngest.handleChunk({
          fileId: "file-1",
          fileName: "file.txt",
          chunkIndex: 0,
          totalChunks: 2,
          data: Buffer.from("hello").toString("base64"),
        });

        const isQueue = Queue.isQueue(result);
        expect(isQueue).toBe(true);
        if (!isQueue) {
          return;
        }

        const events = yield* takeAll(result);
        const tags = events.map((event) => (event as { _tag: string })._tag);

        expect(tags).toEqual(["chunk-received"]);
      }).pipe(Effect.provide(UploadIngestTestLayer)),
    ),
  );

  it.effect("streams ingest progress events on final chunk", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const uploadIngest = yield* UploadIngestService;
        const content = "a".repeat(1500);

        const result = yield* uploadIngest.handleChunk({
          fileId: "file-2",
          fileName: "notes.txt",
          chunkIndex: 0,
          totalChunks: 1,
          data: Buffer.from(content).toString("base64"),
        });

        const isQueue = Queue.isQueue(result);
        expect(isQueue).toBe(true);
        if (!isQueue) {
          return;
        }

        const events = yield* Queue.takeAll(result);
        const tags = Array.from(events).map(
          (event) => (event as { _tag: string })._tag,
        );

        expect(tags).toContain("chunk-received");
      }).pipe(Effect.provide(UploadIngestTestLayer)),
    ),
  );
});
