import { Chunker } from "@repo/domain/Chunk";
import {
  FastChunker,
  FastChunkerConfig,
  SentenceChunker,
  SentenceChunkerConfig,
  WordTokenizerLive,
} from "@repo/rag";
import { Effect, Layer } from "effect";
import { runtime } from "../atom";

export type ChunkerKind = "fast" | "sentence";

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

const chunkerLayerFor = (input: ChunkerRequest) => {
  switch (input.chunker) {
    case "fast":
      return fastChunkerLayer(input.config);
    case "sentence":
      return sentenceChunkerLayer(input.config);
  }
};

export const chunkerAtom = runtime.fn((input: ChunkerRequest) =>
  Effect.gen(function* () {
    const chunker = yield* Chunker;
    return yield* chunker.chunk(input.text);
  }).pipe(Effect.provide(chunkerLayerFor(input))),
);
