import { describe, expect, it } from "@effect/vitest";
import { ChunkError, Chunker } from "@repo/domain/Chunk";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import {
  CharacterTokenizerLive,
  WordTokenizerLive,
} from "../tokenizer/DelimTokenizer";
import { TableChunker, TableChunkerConfig } from "./TableChunker";

const makeTableChunkerLive = (
  config: {
    chunkSize: number;
    mode: "row" | "token";
    format: "markdown" | "html" | "auto";
  },
  tokenizerLive = WordTokenizerLive,
) =>
  Layer.effect(Chunker)(TableChunker.make).pipe(
    Layer.provide(tokenizerLive),
    Layer.provide(Layer.succeed(TableChunkerConfig, config)),
  );
const markdownTable = `| name | score |
| --- | --- |
| Ada | 91 |
| Lin | 88 |
| Sam | 95 |
| Mia | 90 |
`;
const htmlTable = `<table><thead><tr><th>name</th><th>score</th></tr></thead><tbody><tr><td>Ada</td><td>91</td></tr><tr><td>Lin</td><td>88</td></tr><tr><td>Sam</td><td>95</td></tr><tr><td>Mia</td><td>90</td></tr></tbody></table>`;
describe("TableChunker", () => {
  it.layer(
    makeTableChunkerLive({
      chunkSize: 2,
      mode: "row",
      format: "markdown",
    }),
  )((it) => {
    it.effect("chunks markdown table in row mode and repeats header", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk(markdownTable);
        expect(chunks.length).toEqual(2);
        expect(chunks.map((c) => c.tokenCount)).toEqual([2, 2]);
        for (const chunk of chunks) {
          expect(chunk.text).toContain("| name | score |");
          expect(chunk.text).toContain("| --- | --- |");
        }
        expect(chunks[0]?.text).toContain("| Ada | 91 |");
        expect(chunks[0]?.text).toContain("| Lin | 88 |");
        expect(chunks[1]?.text).toContain("| Sam | 95 |");
        expect(chunks[1]?.text).toContain("| Mia | 90 |");
      }),
    );
    it.effect("returns empty chunks for whitespace-only input", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk("   \n\t  ");
        expect(chunks).toEqual([]);
      }),
    );
  });
  it.layer(
    makeTableChunkerLive(
      {
        chunkSize: 12,
        mode: "token",
        format: "markdown",
      },
      CharacterTokenizerLive,
    ),
  )((it) => {
    it.effect("chunks markdown table in token mode with header preserved", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk(markdownTable);
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
          expect(chunk.text).toContain("| name | score |");
          expect(chunk.text).toContain("| --- | --- |");
          expect(chunk.tokenCount).toBeGreaterThan(0);
        }
      }),
    );
  });
  it.layer(
    makeTableChunkerLive({
      chunkSize: 2,
      mode: "row",
      format: "html",
    }),
  )((it) => {
    it.effect("chunks html table in row mode and preserves shell", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk(htmlTable);
        expect(chunks.length).toEqual(2);
        expect(chunks.map((c) => c.tokenCount)).toEqual([2, 2]);
        for (const chunk of chunks) {
          expect(chunk.text.toLowerCase()).toContain("<table");
          expect(chunk.text.toLowerCase()).toContain("</table>");
          expect(chunk.text.toLowerCase()).toContain("<tr");
        }
      }),
    );
  });
  it.layer(
    makeTableChunkerLive({
      chunkSize: 2,
      mode: "row",
      format: "auto",
    }),
  )((it) => {
    it.effect("auto-detects markdown and html table formats", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const markdownChunks = yield* chunker.chunk(markdownTable);
        const htmlChunks = yield* chunker.chunk(htmlTable);
        expect(markdownChunks.length).toBeGreaterThan(0);
        expect(htmlChunks.length).toBeGreaterThan(0);
      }),
    );
  });
  it.layer(
    makeTableChunkerLive({
      chunkSize: 2,
      mode: "row",
      format: "markdown",
    }),
  )((it) => {
    it.effect("emits monotonic valid offsets mapped to source rows", () =>
      Effect.gen(function* () {
        const chunker = yield* Chunker;
        const chunks = yield* chunker.chunk(markdownTable);
        let prevStart = -1;
        let prevEnd = -1;
        for (const chunk of chunks) {
          expect(chunk.startIdx).toBeGreaterThanOrEqual(0);
          expect(chunk.endIdx).toBeGreaterThan(chunk.startIdx);
          expect(chunk.startIdx).toBeGreaterThan(prevStart);
          expect(chunk.endIdx).toBeGreaterThan(prevEnd);
          prevStart = chunk.startIdx;
          prevEnd = chunk.endIdx;
        }
      }),
    );
  });
  it.effect("fails on invalid config where chunkSize is non-positive", () =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const chunker = yield* Chunker;
        return yield* chunker.chunk(markdownTable);
      }).pipe(
        Effect.provide(
          makeTableChunkerLive({
            chunkSize: 0,
            mode: "row",
            format: "markdown",
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
            "Invalid table chunker config",
          );
        }
      }
    }),
  );
});
