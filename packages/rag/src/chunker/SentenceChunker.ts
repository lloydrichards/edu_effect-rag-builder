import { type Chunk, ChunkError, Chunker, Tokenizer } from "@repo/domain/Chunk";
import { Array, Effect, Layer, pipe, ServiceMap, String } from "effect";
import { WordTokenizerLive } from "../tokenizer/DelimTokenizer";

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

type SentenceSpan = Omit<Chunk, "tokenCount">;

const sliceSpan = (
  text: string,
  startIdx: number,
  endIdx: number,
): SentenceSpan => ({ text: text.slice(startIdx, endIdx), startIdx, endIdx });

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

const toDelimiterPattern = (delimiters: ReadonlyArray<string>): RegExp => {
  const alternatives = delimiters
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(alternatives, "g");
};

const findDelimiterMatches = (
  text: string,
  delimiters: ReadonlyArray<string>,
) =>
  pipe(
    text,
    String.matchAll(toDelimiterPattern(delimiters)),
    Array.fromIterable,
    Array.reduce<SentenceSpan[], RegExpMatchArray>([], (acc, match) => {
      const delimiter = match[0];
      const startIdx = match.index;

      if (delimiter === undefined || startIdx === undefined) {
        return acc;
      }

      return Array.append(acc, {
        text: delimiter,
        startIdx,
        endIdx: startIdx + delimiter.length,
      });
    }),
  );

const splitSentences = (
  text: string,
  delimiters: ReadonlyArray<string>,
  includeDelim: "prev" | "next" | null,
) => {
  if (delimiters.length === 0) {
    return text.length === 0
      ? []
      : [{ text, startIdx: 0, endIdx: text.length }];
  }

  const delimiterMatches = findDelimiterMatches(text, delimiters);
  if (delimiterMatches.length === 0) {
    return [{ text, startIdx: 0, endIdx: text.length }];
  }

  const units: Array<SentenceSpan> = [];

  if (includeDelim === "prev") {
    let cursor = 0;
    for (const delimiter of delimiterMatches) {
      units.push(sliceSpan(text, cursor, delimiter.endIdx));
      cursor = delimiter.endIdx;
    }
    if (cursor < text.length) {
      units.push(sliceSpan(text, cursor, text.length));
    }
  } else if (includeDelim === "next") {
    const firstDelimiter = delimiterMatches[0];
    if (firstDelimiter !== undefined) {
      units.push(sliceSpan(text, 0, firstDelimiter.startIdx));
    }

    for (let index = 0; index < delimiterMatches.length; index++) {
      const current = delimiterMatches[index];
      if (current === undefined) {
        continue;
      }

      const next = delimiterMatches[index + 1];
      const endIdx = next?.startIdx ?? text.length;
      units.push(sliceSpan(text, current.startIdx, endIdx));
    }
  } else {
    let cursor = 0;
    for (const delimiter of delimiterMatches) {
      units.push(sliceSpan(text, cursor, delimiter.startIdx));
      cursor = delimiter.endIdx;
    }
    if (cursor <= text.length) {
      units.push(sliceSpan(text, cursor, text.length));
    }
  }

  return pipe(
    units,
    Array.filter((unit) => unit.text.length > 0),
  );
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
        if (String.isEmpty(String.trim(text))) {
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
