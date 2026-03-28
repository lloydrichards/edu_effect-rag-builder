import { Data, type Effect, Schema, ServiceMap } from "effect";

export class ChunkError extends Data.TaggedError("ChunkError")<{
  message: string;
  cause?: unknown;
}> {}
export class TokenizerError extends Data.TaggedError("TokenizerError")<{
  message: string;
  cause?: unknown;
}> {}

export const Chunk = Schema.Struct({
  text: Schema.String,
  startIdx: Schema.Number,
  endIdx: Schema.Number,
  tokenCount: Schema.Number,
  metadata: Schema.Record(Schema.String, Schema.Unknown),
});

export type Chunk = typeof Chunk.Type;

export const VocabRef = ServiceMap.Reference("VocabRef", {
  defaultValue: () => new Map<string, number>(),
});
export const ReverseRef = ServiceMap.Reference("ReverseRef", {
  defaultValue: () => new Map<number, string>(),
});
export const NextIdRef = ServiceMap.Reference("NextIdRef", {
  defaultValue: () => 0,
});

export class Tokenizer extends ServiceMap.Service<
  Tokenizer,
  {
    encode: (text: string) => Effect.Effect<ReadonlyArray<number>>;
    decode: (
      tokens: ReadonlyArray<number>,
    ) => Effect.Effect<string, TokenizerError>;
    countTokens: (text: string) => Effect.Effect<number>;
  }
>()("Tokenizer") {}

export class Chunker extends ServiceMap.Service<
  Chunker,
  {
    readonly name: string;
    chunk: (
      text: string,
    ) => Effect.Effect<Array<Chunk>, ChunkError | TokenizerError>;
  }
>()("Chunker") {}
