import { type Chunk, ChunkError, Chunker, Tokenizer } from "@repo/domain/Chunk";
import { Effect, Layer, ServiceMap } from "effect";
import { WordTokenizerLive } from "../tokenizer/DelimTokenizer";
import {
  buildDelimiterPattern,
  findDelimiterSpans,
  type IncludeDelim,
  isBlank,
  splitTextByMatches,
  type TextSpan,
} from "./util";

export const SentenceChunkerConfig = ServiceMap.Reference<{
  chunkSize: number;
  chunkOverlap: number;
  delimiters: string[];
  includeDelim: "prev" | "next" | null;
}>("SentenceChunkerConfig", {
  defaultValue: () => ({
    chunkSize: 2048,
    chunkOverlap: 0,
    delimiters: [". ", "! ", "? ", "\n"],
    includeDelim: "prev",
  }),
});

const validateConfig = (config: {
  chunkSize: number;
  chunkOverlap: number;
  delimiters: string[];
}) =>
  config.chunkSize > 0 &&
  config.chunkOverlap >= 0 &&
  config.chunkOverlap < config.chunkSize &&
  config.delimiters.length > 0 &&
  config.delimiters.every((delimiter) => delimiter.length > 0);

const splitSentences = (
  text: string,
  delimiters: ReadonlyArray<string>,
  includeDelim: IncludeDelim,
): Array<TextSpan> => {
  if (delimiters.length === 0) {
    return text.length === 0
      ? []
      : [{ text, startIdx: 0, endIdx: text.length }];
  }

  const pattern = buildDelimiterPattern(delimiters);
  const delimiterMatches = findDelimiterSpans(text, pattern);

  if (delimiterMatches.length === 0) {
    return [{ text, startIdx: 0, endIdx: text.length }];
  }

  return splitTextByMatches(text, delimiterMatches, includeDelim);
};

const windowFrom = (
  sentences: Array<Chunk>,
  startIdx: number,
  chunkSize: number,
): {
  startIdx: number;
  endExclusive: number;
  tokenCount: number;
  text: string;
} => {
  let tokenCount = 0;
  let endExclusive = startIdx;
  let text = "";

  while (endExclusive < sentences.length) {
    const next = sentences[endExclusive];
    if (next === undefined) {
      break;
    }

    if (tokenCount > 0 && tokenCount + next.tokenCount > chunkSize) {
      break;
    }

    text = `${text}${next.text}`;
    tokenCount += next.tokenCount;
    endExclusive += 1;
  }

  return {
    startIdx,
    endExclusive,
    tokenCount,
    text,
  };
};

const toChunk = (
  sentences: Array<Chunk>,
  window: {
    startIdx: number;
    endExclusive: number;
    tokenCount: number;
    text: string;
  },
): Chunk | null => {
  const startSentence = sentences[window.startIdx];
  const endSentence = sentences[window.endExclusive - 1];
  if (startSentence === undefined || endSentence === undefined) {
    return null;
  }

  return {
    text: window.text,
    startIdx: startSentence.startIdx,
    endIdx: endSentence.endIdx,
    tokenCount: window.tokenCount,
    metadata: {},
  };
};

const nextStartFromOverlap = (
  sentences: Array<Chunk>,
  currentStart: number,
  endExclusive: number,
  chunkOverlap: number,
): number => {
  if (chunkOverlap <= 0 || endExclusive >= sentences.length) {
    return endExclusive;
  }

  let overlapTokens = 0;
  let nextStart = endExclusive;

  for (let index = endExclusive - 1; index >= currentStart; index--) {
    const sentence = sentences[index];
    if (sentence === undefined) {
      continue;
    }

    overlapTokens += sentence.tokenCount;
    nextStart = index;

    if (overlapTokens >= chunkOverlap) {
      break;
    }
  }

  return nextStart <= currentStart ? currentStart + 1 : nextStart;
};

export class SentenceChunker extends ServiceMap.Service<Chunker>()(
  "SentenceChunker",
  {
    make: Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;
      const { chunkSize, chunkOverlap, delimiters, includeDelim } =
        yield* SentenceChunkerConfig;

      if (
        !validateConfig({
          chunkSize,
          chunkOverlap,
          delimiters,
        })
      ) {
        return yield* Effect.fail(
          new ChunkError({
            message: "Invalid sentence chunker config",
          }),
        );
      }
      const chunk = Effect.fn("SentenceChunker.chunk")(function* (
        text: string,
      ) {
        if (isBlank(text)) {
          return [];
        }

        const sentenceSpans = splitSentences(text, delimiters, includeDelim);

        if (sentenceSpans.length === 0) {
          return [];
        }

        const sentences = yield* Effect.forEach(sentenceSpans, (sentence) =>
          Effect.map(tokenizer.countTokens(sentence.text), (tokenCount) => ({
            ...sentence,
            tokenCount,
          })),
        );

        if (sentences.length === 0) {
          return [];
        }

        const chunks: Array<Chunk> = [];
        let startIdx = 0;

        while (startIdx < sentences.length) {
          const window = windowFrom(sentences, startIdx, chunkSize);
          const chunk = toChunk(sentences, window);

          if (chunk === null) {
            break;
          }

          chunks.push(chunk);
          startIdx = nextStartFromOverlap(
            sentences,
            startIdx,
            window.endExclusive,
            chunkOverlap,
          );
        }

        return chunks;
      });

      return {
        chunk,
        name: "sentence",
      };
    }),
  },
) {}

export const SentenceChunkerLive = Layer.effect(Chunker)(
  SentenceChunker.make,
).pipe(Layer.provide(WordTokenizerLive));
