import { useCallback, useMemo, useState } from "react";
import type {
  ChunkerRequest,
  NonEmptyArray,
  RecursiveChunkerRule,
  RecursiveChunkerSettings,
} from "@/lib/atoms/chunker-atom";

const DEFAULT_RECURSIVE_CONFIG: RecursiveChunkerSettings = {
  chunkSize: 720,
  minCharactersPerChunk: 48,
  rules: [
    { delimiters: ["\n\n"], includeDelim: "prev" },
    { delimiters: ["\n"], includeDelim: "prev" },
    { whitespace: true, includeDelim: "prev" },
    {},
  ],
};

const normalizeRecursiveConfig = (
  config: RecursiveChunkerSettings,
): RecursiveChunkerSettings => ({
  ...config,
  chunkSize: Math.max(1, Math.floor(config.chunkSize)),
  minCharactersPerChunk: Math.max(1, Math.floor(config.minCharactersPerChunk)),
  rules: normalizeRecursiveRules(config.rules),
});

const normalizeRecursiveRules = (
  rules: ReadonlyArray<RecursiveChunkerRule>,
): NonEmptyArray<RecursiveChunkerRule> => {
  const normalized = rules.map((rule) => {
    if (rule.delimiters && rule.delimiters.length > 0) {
      return {
        ...rule,
        delimiters: rule.delimiters as NonEmptyArray<string>,
      };
    }
    return rule;
  });
  return ensureNonEmptyRules(normalized, DEFAULT_RECURSIVE_CONFIG.rules);
};

const buildRecursiveRequest = (
  text: string,
  config: RecursiveChunkerSettings,
): ChunkerRequest => ({ text, chunker: "recursive", config });

const ensureNonEmptyRules = (
  value: ReadonlyArray<RecursiveChunkerRule>,
  fallback: NonEmptyArray<RecursiveChunkerRule>,
): NonEmptyArray<RecursiveChunkerRule> =>
  (value.length > 0 ? value : fallback) as NonEmptyArray<RecursiveChunkerRule>;

export const useRecursiveChunkerConfig = () => {
  const [config, setConfig] = useState<RecursiveChunkerSettings>(
    DEFAULT_RECURSIVE_CONFIG,
  );
  const normalized = useMemo(() => normalizeRecursiveConfig(config), [config]);
  const buildRequest = useCallback(
    (text: string) => buildRecursiveRequest(text, normalized),
    [normalized],
  );
  return { config, setConfig, normalized, buildRequest };
};
