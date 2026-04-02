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
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

export type Chunk = typeof Chunk.Type;

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
    ) => Effect.Effect<Array<Chunk>, Schema.SchemaError | TokenizerError>;
  }
>()("Chunker") {}
