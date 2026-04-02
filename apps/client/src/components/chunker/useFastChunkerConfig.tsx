import { useCallback, useMemo, useState } from "react";
import type {
  ChunkerRequest,
  FastChunkerSettings,
  NonEmptyArray,
} from "@/lib/atoms/chunker-atom";

const DEFAULT_FAST_CONFIG: FastChunkerSettings = {
  chunkSize: 320,
  delimiters: ["\n", ".", "?", "!"] as NonEmptyArray<string>,
};

const normalizeFastConfig = (
  config: FastChunkerSettings,
): FastChunkerSettings => ({
  ...config,
  chunkSize: Math.max(1, Math.floor(config.chunkSize)),
  delimiters: config.delimiters,
});

const buildFastRequest = (
  text: string,
  config: FastChunkerSettings,
): ChunkerRequest => ({ text, chunker: "fast", config });

export const useFastChunkerConfig = () => {
  const [config, setConfig] =
    useState<FastChunkerSettings>(DEFAULT_FAST_CONFIG);
  const normalized = useMemo(() => normalizeFastConfig(config), [config]);
  const buildRequest = useCallback(
    (text: string) => buildFastRequest(text, normalized),
    [normalized],
  );
  return { config, setConfig, normalized, buildRequest };
};
