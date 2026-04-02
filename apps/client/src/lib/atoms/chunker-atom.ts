import { Chunker } from "@repo/domain/Chunk";
import {
  FastChunker,
  FastChunkerConfig,
  RecursiveChunker,
  RecursiveChunkerConfig,
  SentenceChunker,
  SentenceChunkerConfig,
  TableChunker,
  TableChunkerConfig,
  TokenChunker,
  TokenChunkerConfig,
  WordTokenizerLive,
} from "@repo/rag";
import { Effect, Layer } from "effect";
import { runtime } from "../atom";

export type ChunkerKind = "fast" | "sentence" | "recursive" | "token" | "table";

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type FastChunkerSettings = Readonly<{
  chunkSize: number;
  delimiters: NonEmptyArray<string>;
}>;

export type SentenceChunkerSettings = Readonly<{
  chunkSize: number;
  chunkOverlap: number;
  delimiters: NonEmptyArray<string>;
  includeDelim: "prev" | "next" | null;
}>;

export type RecursiveChunkerRule = Readonly<{
  delimiters?: NonEmptyArray<string>;
  whitespace?: boolean;
  includeDelim?: "prev" | "next" | null;
}>;

export type RecursiveChunkerSettings = Readonly<{
  chunkSize: number;
  minCharactersPerChunk: number;
  rules: NonEmptyArray<RecursiveChunkerRule>;
}>;

export type TokenChunkerSettings = Readonly<{
  chunkSize: number;
  chunkOverlap: number;
}>;

export type TableChunkerSettings = Readonly<{
  chunkSize: number;
  mode: "row" | "token";
  format: "auto" | "markdown" | "html";
}>;

export type ChunkerRequest =
  | Readonly<{
      text: string;
      chunker: "fast";
      config: FastChunkerSettings;
    }>
  | Readonly<{
      text: string;
      chunker: "sentence";
      config: SentenceChunkerSettings;
    }>
  | Readonly<{
      text: string;
      chunker: "recursive";
      config: RecursiveChunkerSettings;
    }>
  | Readonly<{
      text: string;
      chunker: "token";
      config: TokenChunkerSettings;
    }>
  | Readonly<{
      text: string;
      chunker: "table";
      config: TableChunkerSettings;
    }>;

const fastChunkerLayer = (config: FastChunkerSettings) =>
  Layer.effect(Chunker)(FastChunker.make).pipe(
    Layer.provide(Layer.succeed(FastChunkerConfig, config)),
  );

const sentenceChunkerLayer = (config: SentenceChunkerSettings) =>
  Layer.effect(Chunker)(SentenceChunker.make).pipe(
    Layer.provide(WordTokenizerLive),
    Layer.provide(Layer.succeed(SentenceChunkerConfig, config)),
  );

const recursiveChunkerLayer = (config: RecursiveChunkerSettings) =>
  Layer.effect(Chunker)(RecursiveChunker.make).pipe(
    Layer.provide(WordTokenizerLive),
    Layer.provide(Layer.succeed(RecursiveChunkerConfig, config)),
  );

const tokenChunkerLayer = (config: TokenChunkerSettings) =>
  Layer.effect(Chunker)(TokenChunker.make).pipe(
    Layer.provide(WordTokenizerLive),
    Layer.provide(Layer.succeed(TokenChunkerConfig, config)),
  );

const tableChunkerLayer = (config: TableChunkerSettings) =>
  Layer.effect(Chunker)(TableChunker.make).pipe(
    Layer.provide(WordTokenizerLive),
    Layer.provide(Layer.succeed(TableChunkerConfig, config)),
  );

const chunkerLayerFor = (input: ChunkerRequest) => {
  switch (input.chunker) {
    case "fast":
      return fastChunkerLayer(input.config);
    case "sentence":
      return sentenceChunkerLayer(input.config);
    case "recursive":
      return recursiveChunkerLayer(input.config);
    case "token":
      return tokenChunkerLayer(input.config);
    case "table":
      return tableChunkerLayer(input.config);
  }
};

export const chunkerAtom = runtime.fn((input: ChunkerRequest) =>
  Effect.gen(function* () {
    const chunker = yield* Chunker;
    return yield* chunker.chunk(input.text);
  }).pipe(Effect.provide(chunkerLayerFor(input))),
);
