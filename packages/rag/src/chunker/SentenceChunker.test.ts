import { describe, expect, it } from "@effect/vitest";
import { Chunker } from "@repo/domain/Chunk";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { SchemaError } from "effect/Schema";
import {
  CharacterTokenizerLive,
  WordTokenizerLive,
} from "../tokenizer/DelimTokenizer";
import { SentenceChunker, SentenceChunkerConfig } from "./SentenceChunker";

const makeSentenceChunkerLive = (
  config: {
    chunkSize: number;
    chunkOverlap: number;
    delimiters: readonly [string, ...string[]];
    includeDelim: "prev" | "next" | null;
  },
  tokenizerLive = WordTokenizerLive,
) =>
  Layer.effect(Chunker)(SentenceChunker.make).pipe(
    Layer.provide(tokenizerLive),
    Layer.provide(Layer.succeed(SentenceChunkerConfig, config)),
  );

describe("SentenceChunker", () => {
  it.layer(
    makeSentenceChunkerLive(
      {
        chunkSize: 40,
        chunkOverlap: 10,
        delimiters: [". ", "! ", "? "],
        includeDelim: "prev",
      },
      CharacterTokenizerLive,
    ),
  )((it) => {
    it.effect(
      "Given sentence delimiters and overlap, when chunking, then windows overlap by sentence",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const text =
            "Alpha is first. Beta is second! Gamma is third? Delta is fourth.";
          const chunks = yield* chunker.chunk(text);

          expect(chunks.map((chunk) => chunk.text)).toEqual([
            "Alpha is first. Beta is second! ",
            "Beta is second! Gamma is third? ",
            "Gamma is third? Delta is fourth.",
          ]);
          expect(chunks.map((chunk) => chunk.startIdx)).toEqual([0, 16, 32]);
          expect(chunks.map((chunk) => chunk.endIdx)).toEqual([32, 48, 64]);
          expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([32, 32, 32]);
          expect(chunks.map((chunk) => chunk.metadata)).toEqual([{}, {}, {}]);
        }),
    );

    it.effect(
      "Given whitespace-only input, when chunking, then returns empty chunks",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const chunks = yield* chunker.chunk("   \n\t  ");

          expect(chunks).toEqual([]);
        }),
    );

    it.effect(
      "Given same input and config, when chunking twice, then output is deterministic",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const text = "One. Two. Three. Four.";

          const first = yield* chunker.chunk(text);
          const second = yield* chunker.chunk(text);

          expect(second).toEqual(first);
        }),
    );
  });

  it.effect(
    "Given overlap equals chunk size, when chunking, then config validation fails",
    () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const chunker = yield* Chunker;
          return yield* chunker.chunk("A. B.");
        }).pipe(
          Effect.provide(
            makeSentenceChunkerLive({
              chunkSize: 5,
              chunkOverlap: 5,
              delimiters: [". "],
              includeDelim: "prev",
            }),
          ),
        );

        const exit = yield* Effect.exit(program);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            expect(failure.value).toBeInstanceOf(SchemaError);
            expect(failure.value.message).toContain(
              "chunkOverlap must be less than chunkSize",
            );
          }
        }
      }),
  );
});

describe("SentenceChunker delimiter coverage", () => {
  it.layer(
    makeSentenceChunkerLive(
      {
        chunkSize: 20,
        chunkOverlap: 0,
        delimiters: ["."],
        includeDelim: "prev",
      },
      CharacterTokenizerLive,
    ),
  )((it) => {
    it.effect(
      "Given no delimiters present, when chunking, then returns a single span",
      () =>
        Effect.gen(function* () {
          const chunker = yield* Chunker;
          const text = "Alpha beta";
          const chunks = yield* chunker.chunk(text);

          expect(chunks.length).toBe(1);
          expect(chunks[0]?.text).toBe(text);
          expect(chunks[0]?.startIdx).toBe(0);
          expect(chunks[0]?.endIdx).toBe(text.length);
          if (chunks[0]) {
            expect(text.slice(chunks[0].startIdx, chunks[0].endIdx)).toBe(
              chunks[0].text,
            );
          }
        }),
    );
  });
});

describe("SentenceChunker delimiter and sentence rules", () => {
  it.effect(
    "Given includeDelim policy, when chunking, then delimiters attach as configured",
    () =>
      Effect.gen(function* () {
        const text = "Alpha. Beta.";

        const prevChunks = yield* Effect.gen(function* () {
          const chunker = yield* Chunker;
          return yield* chunker.chunk(text);
        }).pipe(
          Effect.provide(
            makeSentenceChunkerLive(
              {
                chunkSize: 7,
                chunkOverlap: 0,
                delimiters: [". "],
                includeDelim: "prev",
              },
              CharacterTokenizerLive,
            ),
          ),
        );

        const nextChunks = yield* Effect.gen(function* () {
          const chunker = yield* Chunker;
          return yield* chunker.chunk(text);
        }).pipe(
          Effect.provide(
            makeSentenceChunkerLive(
              {
                chunkSize: 7,
                chunkOverlap: 0,
                delimiters: [". "],
                includeDelim: "next",
              },
              CharacterTokenizerLive,
            ),
          ),
        );

        const nullChunks = yield* Effect.gen(function* () {
          const chunker = yield* Chunker;
          return yield* chunker.chunk(text);
        }).pipe(
          Effect.provide(
            makeSentenceChunkerLive(
              {
                chunkSize: 5,
                chunkOverlap: 0,
                delimiters: [". "],
                includeDelim: null,
              },
              CharacterTokenizerLive,
            ),
          ),
        );

        expect(prevChunks.map((chunk) => chunk.text)).toEqual([
          "Alpha. ",
          "Beta.",
        ]);
        expect(nextChunks.map((chunk) => chunk.text)).toEqual([
          "Alpha",
          ". Beta.",
        ]);
        expect(nullChunks.map((chunk) => chunk.text)).toEqual([
          "Alpha",
          "Beta.",
        ]);
      }),
  );
});
