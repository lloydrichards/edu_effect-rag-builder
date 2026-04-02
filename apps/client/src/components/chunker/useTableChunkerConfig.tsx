import { useCallback, useMemo, useState } from "react";
import type {
  ChunkerRequest,
  TableChunkerSettings,
} from "@/lib/atoms/chunker-atom";

const DEFAULT_TABLE_CONFIG: TableChunkerSettings = {
  chunkSize: 3,
  mode: "row",
  format: "auto",
};

const normalizeTableConfig = (
  config: TableChunkerSettings,
): TableChunkerSettings => ({
  ...config,
  chunkSize: Math.max(1, Math.floor(config.chunkSize)),
});

const buildTableRequest = (
  text: string,
  config: TableChunkerSettings,
): ChunkerRequest => ({ text, chunker: "table", config });

export const useTableChunkerConfig = () => {
  const [config, setConfig] =
    useState<TableChunkerSettings>(DEFAULT_TABLE_CONFIG);
  const normalized = useMemo(() => normalizeTableConfig(config), [config]);
  const buildRequest = useCallback(
    (text: string) => buildTableRequest(text, normalized),
    [normalized],
  );
  return { config, setConfig, normalized, buildRequest };
};
