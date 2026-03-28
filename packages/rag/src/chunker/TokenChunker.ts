import { type Chunk, ChunkError, Chunker, Tokenizer } from "@repo/domain/Chunk";
import { Effect, Layer, ServiceMap } from "effect";
import { WordTokenizerLive } from "../tokenizer/DelimTokenizer";

export const TokenChunkerConfig = ServiceMap.Reference("TokenChunkerConfig", {
  defaultValue: () => ({
    chunkSize: 2048,
    chunkOverlap: 0,
  }),
});

export class TokenChunker extends ServiceMap.Service<Chunker>()(
  "TokenChunker",
  {
    make: Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;
      const { chunkSize, chunkOverlap } = yield* TokenChunkerConfig;
      if (chunkSize <= 0 || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
        return yield* Effect.fail(
          new ChunkError({
            message: "Invalid token chunker config",
          }),
        );
      }
      const chunk = Effect.fn("TokenChunker.chunk")(function* (text: string) {
        if (text.trim().length === 0) {
          return [];
        }
        const tokens = yield* tokenizer.encode(text);
        const stride = chunkSize - chunkOverlap;
        const groups: Array<Array<number>> = [];

        for (let start = 0; start < tokens.length; start += stride) {
          const end = Math.min(start + chunkSize, tokens.length);
          groups.push(tokens.slice(start, end));
          if (end === tokens.length) break;
        }
        const chunks: Array<Chunk> = [];
        let currentIndex = 0;

        for (const group of groups) {
          const chunkText = yield* tokenizer.decode(group);
          const overlapText = yield* chunkOverlap > 0
            ? tokenizer.decode(group.slice(-chunkOverlap))
            : Effect.succeed("");

          const startIdx = currentIndex;
          const endIdx = startIdx + chunkText.length;

          chunks.push({
            text: chunkText,
            startIdx,
            endIdx,
            tokenCount: group.length,
            metadata: {},
          });

          currentIndex = endIdx - overlapText.length;
        }

        return chunks;
      });

      return {
        chunk,
        name: "token",
      };
    }),
  },
) {}

export const TokenChunkerLive = Layer.effect(Chunker)(TokenChunker.make).pipe(
  Layer.provide(WordTokenizerLive),
);
