import { useCallback, useMemo, useState } from "react";
import type {
  ChunkerRequest,
  NonEmptyArray,
  SentenceChunkerSettings,
} from "@/lib/atoms/chunker-atom";
import { clampChunkOverlap } from "../chunker-visualizer";

const DEFAULT_SENTENCE_CONFIG: SentenceChunkerSettings = {
  chunkSize: 180,
  chunkOverlap: 20,
  delimiters: [". ", "! ", "? ", "\n", "\n\n"] as NonEmptyArray<string>,
  includeDelim: "prev",
};

const normalizeSentenceConfig = (
  config: SentenceChunkerSettings,
): SentenceChunkerSettings => {
  const chunkSize = Math.max(1, Math.floor(config.chunkSize));
  return {
    ...config,
    chunkSize,
    chunkOverlap: clampChunkOverlap(chunkSize, Math.floor(config.chunkOverlap)),
    delimiters: config.delimiters,
  };
};

const buildSentenceRequest = (
  text: string,
  config: SentenceChunkerSettings,
): ChunkerRequest => ({ text, chunker: "sentence", config });

export const useSentenceChunkerConfig = () => {
  const [config, setConfig] = useState<SentenceChunkerSettings>(
    DEFAULT_SENTENCE_CONFIG,
  );
  const normalized = useMemo(() => normalizeSentenceConfig(config), [config]);
  const buildRequest = useCallback(
    (text: string) => buildSentenceRequest(text, normalized),
    [normalized],
  );
  return { config, setConfig, normalized, buildRequest };
};
