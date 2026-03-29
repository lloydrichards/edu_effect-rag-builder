import { describe, expect, it } from "@effect/vitest";
import { ChunkError, Chunker } from "@repo/domain/Chunk";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { CharacterTokenizerLive } from "../tokenizer/DelimTokenizer";
import {
  RecursiveChunker,
  RecursiveChunkerConfig,
  type RecursiveRule,
} from "./RecursiveChunker";

const makeRecursiveChunkerLive = (config: {
  chunkSize: number;
  minCharactersPerChunk: number;
  rules: ReadonlyArray<RecursiveRule>;
}) =>
  Layer.effect(Chunker)(RecursiveChunker.make).pipe(
    Layer.provide(CharacterTokenizerLive),
    Layer.provide(Layer.succeed(RecursiveChunkerConfig, config)),
  );
describe("RecursiveChunker", () => {
  it.layer(
    makeRecursiveChunkerLive({
      chunkSize: 12,
      minCharactersPerChunk: 1,
      rules: [
        { delimiters: ["\n\n"], includeDelim: "prev" },
        { delimiters: ["\n"], includeDelim: "prev" },
        { whitespace: true, includeDelim: "prev" },
        {},
      ],
    }),
  )((it) => {
    it.effect("returns empty chunks for whitespace-only input", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk("   \n\t ");
        expect(chunks).toEqual([]);
      }),
    );
    it.effect(
      "maintains contiguous offsets that reconstruct original text",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const text =
            "Para1 line1.\nPara1 line2.\n\nPara2 line1.\nPara2 line2.";
          const chunks = yield* chunker.chunk(text);
          expect(chunks.length).toBeGreaterThan(0);
          const reconstructed = chunks.map((c) => c.text).join("");
          expect(reconstructed).toEqual(text);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk === undefined) continue;
            expect(chunk.startIdx).toBeGreaterThanOrEqual(0);
            expect(chunk.endIdx).toBe(chunk.startIdx + chunk.text.length);
            if (i > 0) {
              const prev = chunks[i - 1];
              if (prev !== undefined) {
                expect(chunk.startIdx).toBe(prev.endIdx);
              }
            }
          }
        }),
    );
    it.effect(
      "falls back to token windows when no splitting rule applies",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // delimiter-free
          const chunks = yield* chunker.chunk(text);
          expect(chunks.length).toBeGreaterThan(1);
          expect(chunks.every((c) => c.tokenCount <= 12)).toBe(true);
          expect(chunks.map((c) => c.text).join("")).toEqual(text);
        }),
    );
  });
  it.effect("fails on invalid config", () =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const chunker = yield* Chunker;
        return yield* chunker.chunk("abc");
      }).pipe(
        Effect.provide(
          makeRecursiveChunkerLive({
            chunkSize: 0,
            minCharactersPerChunk: 1,
            rules: [{ delimiters: ["\n"] }],
          }),
        ),
      );
      const exit = yield* Effect.exit(program);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value).toBeInstanceOf(ChunkError);
          expect(failure.value.message).toContain(
            "Invalid recursive chunker config",
          );
        }
      }
    }),
  );
});
