import { describe, expect, it } from "@effect/vitest";
import type { RagHit, RagIngestInput, RagRetrieveInput } from "@repo/rag";
import { RagService } from "@repo/rag";
import { Effect, Layer } from "effect";
import { EmbeddingModel } from "effect/unstable/ai";
import { UploadIngestService } from "./UploadIngestService";

describe("UploadIngestService", () => {
  it.effect("ingests completed upload into Chroma", () => {
    const ingestCalls: RagIngestInput[] = [];

    const RagTestLive = Layer.succeed(
      RagService,
      RagService.of({
        ingest: (input: RagIngestInput) =>
          Effect.sync(() => {
            ingestCalls.push(input);
            return { count: input.ids.length } as const;
          }),
        retrieve: (_input: RagRetrieveInput) =>
          Effect.sync(() => ({ hits: [] as RagHit[] }) as const),
      }),
    );

    const EmbeddingTestLive = Layer.effect(EmbeddingModel.EmbeddingModel)(
      EmbeddingModel.make({
        embedMany: ({ inputs }) =>
          Effect.succeed({
            results: inputs.map((input) => [input.length]),
            usage: { inputTokens: inputs.length },
          }),
      }),
    );

    const UploadIngestLive = UploadIngestService.Default.pipe(
      Layer.provide(RagTestLive),
      Layer.provide(EmbeddingTestLive),
    );

    return Effect.gen(function* () {
      const service = yield* UploadIngestService;

      const content = "hello world";
      const partA = Buffer.from(content.slice(0, 6), "utf8").toString("base64");
      const partB = Buffer.from(content.slice(6), "utf8").toString("base64");

      const first = yield* service.handleChunk({
        fileId: "file-1",
        fileName: "hello.txt",
        chunkIndex: 0,
        totalChunks: 2,
        data: partA,
      });

      expect(first.ok).toBe(true);

      const second = yield* service.handleChunk({
        fileId: "file-1",
        fileName: "hello.txt",
        chunkIndex: 1,
        totalChunks: 2,
        data: partB,
      });

      expect(second.ok).toBe(true);
      expect(ingestCalls).toHaveLength(1);

      const ingest = ingestCalls[0]!;
      expect(ingest.collection).toBe("uploads");
      expect(ingest.documents).toStrictEqual([content]);
      expect(ingest.embeddings).toStrictEqual([[content.length]]);
      expect(ingest.metadatas?.[0]?.["fileName"]).toBe("hello.txt");
    }).pipe(Effect.provide(UploadIngestLive), Effect.scoped);
  });
});
