import { useCallback, useMemo, useState } from "react";
import type {
  ChunkerRequest,
  TokenChunkerSettings,
} from "@/lib/atoms/chunker-atom";
import { clampChunkOverlap } from "../chunker-visualizer";

const DEFAULT_TOKEN_CONFIG: TokenChunkerSettings = {
  chunkSize: 240,
  chunkOverlap: 24,
};

const normalizeTokenConfig = (
  config: TokenChunkerSettings,
): TokenChunkerSettings => {
  const chunkSize = Math.max(1, Math.floor(config.chunkSize));
  return {
    ...config,
    chunkSize,
    chunkOverlap: clampChunkOverlap(chunkSize, Math.floor(config.chunkOverlap)),
  };
};

const buildTokenRequest = (
  text: string,
  config: TokenChunkerSettings,
): ChunkerRequest => ({ text, chunker: "token", config });

export const useTokenChunkerConfig = () => {
  const [config, setConfig] =
    useState<TokenChunkerSettings>(DEFAULT_TOKEN_CONFIG);
  const normalized = useMemo(() => normalizeTokenConfig(config), [config]);
  const buildRequest = useCallback(
    (text: string) => buildTokenRequest(text, normalized),
    [normalized],
  );
  return { config, setConfig, normalized, buildRequest };
};
