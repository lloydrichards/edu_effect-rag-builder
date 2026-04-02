import {
  type Chunk,
  Chunker,
  Tokenizer,
  type TokenizerError,
} from "@repo/domain/Chunk";
import { Effect, Layer, Schema, ServiceMap } from "effect";
import { WordTokenizerLive } from "../tokenizer/DelimTokenizer";
import {
  buildDelimiterPattern,
  findDelimiterSpans,
  IncludeDelim,
  isBlank,
  splitTextByMatches,
} from "./utils";

const RecursiveRuleSchema = Schema.Struct({
  delimiters: Schema.optional(Schema.NonEmptyArray(Schema.String)),
  whitespace: Schema.optional(Schema.Boolean),
  includeDelim: Schema.optional(IncludeDelim),
}).pipe(
  Schema.check(
    Schema.makeFilter(
      ({ delimiters, whitespace }) =>
        (delimiters && delimiters.length > 0) ||
        whitespace === true ||
        (!delimiters && !whitespace) ||
        "Rule must define delimiters, whitespace, or be an empty fallback",
    ),
  ),
);

export type RecursiveRule = typeof RecursiveRuleSchema.Type;

const RecursiveChunkerConfigSchema = Schema.Struct({
  chunkSize: Schema.Number.check(Schema.isGreaterThan(0)),
  minCharactersPerChunk: Schema.Number.check(Schema.isGreaterThan(0)),
  rules: Schema.NonEmptyArray(RecursiveRuleSchema),
});

export const RecursiveChunkerConfig = ServiceMap.Reference<
  typeof RecursiveChunkerConfigSchema.Type
>("RecursiveChunkerConfig", {
  defaultValue: () => ({
    chunkSize: 2048,
    minCharactersPerChunk: 24,
    rules: [
      { delimiters: ["\n\n"], includeDelim: "prev" },
      { delimiters: ["\n"], includeDelim: "prev" },
      { whitespace: true, includeDelim: "prev" },
      {},
    ],
  }),
});

const enforceMinCharacters = (
  parts: ReadonlyArray<string>,
  minCharactersPerChunk: number,
): Array<string> => {
  if (parts.length <= 1 || minCharactersPerChunk <= 1) return [...parts];
  const merged: Array<string> = [];
  for (const part of parts) {
    if (part.length < minCharactersPerChunk && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${part}`;
    } else {
      merged.push(part);
    }
  }
  if (merged.length > 1 && (merged[0]?.length ?? 0) < minCharactersPerChunk) {
    merged[1] = `${merged[0]}${merged[1]}`;
    merged.shift();
  }
  return merged;
};

const splitByRule = (
  text: string,
  rule: RecursiveRule,
  minCharactersPerChunk: number,
): Array<string> => {
  if (text.length === 0) return [];
  const includeDelim = rule.includeDelim ?? "prev";
  if (rule.delimiters && rule.delimiters.length > 0) {
    const pattern = buildDelimiterPattern(rule.delimiters);
    const matches = findDelimiterSpans(text, pattern);
    const parts = splitTextByMatches(text, matches, includeDelim).map(
      (part) => part.text,
    );
    return enforceMinCharacters(parts, minCharactersPerChunk);
  }
  if (rule.whitespace) {
    const matches = findDelimiterSpans(text, /\s+/g);
    const parts = splitTextByMatches(text, matches, includeDelim).map(
      (part) => part.text,
    );
    return enforceMinCharacters(parts, minCharactersPerChunk);
  }
  // fallback level: no split here; recursion will use token fallback later
  return [text];
};

const mergeSplits = (
  splits: ReadonlyArray<string>,
  tokenCounts: ReadonlyArray<number>,
  chunkSize: number,
): { mergedSplits: Array<string>; mergedTokenCounts: Array<number> } => {
  if (splits.length === 0) {
    return { mergedSplits: [], mergedTokenCounts: [] };
  }
  if (splits.length !== tokenCounts.length) {
    return { mergedSplits: [...splits], mergedTokenCounts: [...tokenCounts] };
  }
  const mergedSplits: Array<string> = [];
  const mergedTokenCounts: Array<number> = [];
  let currentText = splits[0] ?? "";
  let currentTokens = tokenCounts[0] ?? 0;
  for (let i = 1; i < splits.length; i++) {
    const nextText = splits[i] ?? "";
    const nextTokens = tokenCounts[i] ?? 0;
    const canMerge = currentTokens + nextTokens <= chunkSize;
    if (canMerge) {
      currentText = `${currentText}${nextText}`;
      currentTokens += nextTokens;
    } else {
      mergedSplits.push(currentText);
      mergedTokenCounts.push(currentTokens);
      currentText = nextText;
      currentTokens = nextTokens;
    }
  }
  mergedSplits.push(currentText);
  mergedTokenCounts.push(currentTokens);
  return { mergedSplits, mergedTokenCounts };
};

const toChunk = (
  text: string,
  startIdx: number,
  tokenCount: number,
  metadata?: Record<string, unknown>,
): Chunk => ({
  text,
  startIdx,
  endIdx: startIdx + text.length,
  tokenCount,
  ...(metadata ? { metadata } : {}),
});

export class RecursiveChunker extends ServiceMap.Service<Chunker>()(
  "RecursiveChunker",
  {
    make: Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;
      const config = yield* RecursiveChunkerConfig;
      const { chunkSize, minCharactersPerChunk, rules } =
        yield* Schema.decodeEffect(RecursiveChunkerConfigSchema)(config);

      const tokenFallback = Effect.fn(function* (
        text: string,
        startOffset: number,
      ) {
        const encoded = yield* tokenizer.encode(text);
        if (encoded.length === 0) return [];
        const chunks: Array<Chunk> = [];
        let currentOffset = startOffset;
        for (let i = 0; i < encoded.length; i += chunkSize) {
          const group = encoded.slice(i, i + chunkSize);
          const chunkText = yield* tokenizer.decode(group);
          chunks.push(
            toChunk(chunkText, currentOffset, group.length, {
              recursiveRuleLevel: -1,
              recursiveRuleType: "tokenFallback",
            }),
          );
          currentOffset += chunkText.length;
        }
        return chunks;
      });

      const recursiveChunk: (
        text: string,
        level: number,
        startOffset: number,
      ) => Effect.Effect<Array<Chunk>, Schema.SchemaError | TokenizerError> = (
        text,
        level,
        startOffset,
      ) =>
        Effect.gen(function* () {
          if (text.length === 0) return [];
          if (level >= rules.length) {
            const tokenCount = yield* tokenizer.countTokens(text);
            if (tokenCount > chunkSize) {
              return yield* tokenFallback(text, startOffset);
            }
            return [
              toChunk(text, startOffset, tokenCount, {
                recursiveRuleLevel: -1,
                recursiveRuleType: "endOfRules",
              }),
            ];
          }
          const rule = rules[level];
          if (rule === undefined) {
            const tokenCount = yield* tokenizer.countTokens(text);
            if (tokenCount > chunkSize) {
              return yield* tokenFallback(text, startOffset);
            }
            return [
              toChunk(text, startOffset, tokenCount, {
                recursiveRuleLevel: -1,
                recursiveRuleType: "missingRule",
              }),
            ];
          }
          if (!rule.delimiters && !rule.whitespace) {
            return yield* tokenFallback(text, startOffset);
          }
          const splits = splitByRule(text, rule, minCharactersPerChunk);
          if (splits.length === 0) return [];
          const tokenCounts = yield* Effect.forEach(splits, (split) =>
            tokenizer.countTokens(split),
          );
          const { mergedSplits, mergedTokenCounts } = mergeSplits(
            splits,
            tokenCounts,
            chunkSize,
          );
          const ruleType = rule.delimiters
            ? "delimiter"
            : rule.whitespace
              ? "whitespace"
              : "fallback";
          const ruleDelims = rule.delimiters?.join("|");
          const out: Array<Chunk> = [];
          let currentOffset = startOffset;
          for (let i = 0; i < mergedSplits.length; i++) {
            const split = mergedSplits[i] ?? "";
            const tokenCount = mergedTokenCounts[i] ?? 0;
            if (tokenCount > chunkSize) {
              const nested = yield* recursiveChunk(
                split,
                level + 1,
                currentOffset,
              );
              out.push(...nested);
            } else {
              out.push(
                toChunk(split, currentOffset, tokenCount, {
                  recursiveRuleLevel: level,
                  recursiveRuleType: ruleType,
                  ...(ruleDelims ? { recursiveDelimiter: ruleDelims } : {}),
                }),
              );
            }
            currentOffset += split.length;
          }
          return out;
        });

      const chunk = Effect.fn("RecursiveChunker.chunk")(function* (
        text: string,
      ) {
        if (isBlank(text)) return [];
        return yield* recursiveChunk(text, 0, 0);
      });
      return {
        name: "recursive",
        chunk,
      };
    }),
  },
) {}

export const RecursiveChunkerLive = Layer.effect(Chunker)(
  RecursiveChunker.make,
).pipe(Layer.provide(WordTokenizerLive));
