import {
  type Chunk,
  ChunkError,
  Chunker,
  Tokenizer,
  type TokenizerError,
} from "@repo/domain/Chunk";
import { Effect, Layer, ServiceMap } from "effect";
import { WordTokenizerLive } from "../tokenizer/DelimTokenizer";

type TableChunkerMode = "row" | "token";
type TableFormat = "markdown" | "html" | "auto";

type RowSlice = {
  text: string;
  startIdx: number;
  endIdx: number;
};

type ParsedTable = {
  header: string;
  rows: RowSlice[];
  footer: string;
};

type LineSlice = {
  text: string;
  startIdx: number;
  endIdx: number;
};

const detectFormat = (
  input: string,
  format: TableFormat,
): Exclude<TableFormat, "auto"> => {
  if (format !== "auto") return format;
  return input.toLowerCase().includes("<table") ? "html" : "markdown";
};

const splitLinesWithOffsets = (input: string): LineSlice[] => {
  const lines: LineSlice[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const newlineIdx = input.indexOf("\n", cursor);
    const endIdx = newlineIdx === -1 ? input.length : newlineIdx + 1;
    lines.push({
      text: input.slice(cursor, endIdx),
      startIdx: cursor,
      endIdx,
    });
    cursor = endIdx;
  }

  return lines;
};

/* Accepts forms like: | --- | :---: | ---: |*/
const isMarkdownSeparatorRow = (line: string): boolean =>
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());

const splitMarkdownTable = (input: string): ParsedTable | null => {
  const lines = splitLinesWithOffsets(input);
  if (lines.length < 3) return null;

  const headerLine = lines.at(0);
  const separatorLine = lines.at(1);
  if (headerLine === undefined || separatorLine === undefined) return null;
  if (!isMarkdownSeparatorRow(separatorLine.text)) return null;
  const dataRows = lines.slice(2).filter((line) => line.text.trim().length > 0);
  if (dataRows.length === 0) return null;

  return {
    header: `${headerLine.text}${separatorLine.text}`,
    rows: dataRows.map(({ text, startIdx, endIdx }) => ({
      text,
      startIdx,
      endIdx,
    })),
    footer: "",
  };
};

const chunkRowsBySize = (
  rows: ReadonlyArray<RowSlice>,
  chunkSize: number,
): RowSlice[][] => {
  const groups: Array<Array<RowSlice>> = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    groups.push(rows.slice(i, i + chunkSize));
  }
  return groups;
};

const toRowModeChunk = (table: ParsedTable): Chunk | null => {
  const first = table.rows.at(0);
  const last = table.rows.at(-1);
  if (!first || !last) return null;

  return {
    text: `${table.header}${table.rows.map((r) => r.text).join("")}${table.footer}`,
    startIdx: first.startIdx,
    endIdx: last.endIdx,
    tokenCount: table.rows.length,
  };
};

const findHtmlRowsInRange = (
  input: string,
  startIdx: number,
  endIdx: number,
): RowSlice[] => {
  const rows: RowSlice[] = [];
  const lower = input.toLowerCase();
  let cursor = startIdx;

  while (cursor < endIdx) {
    const trStart = lower.indexOf("<tr", cursor);
    if (trStart === -1 || trStart >= endIdx) break;

    const trOpenEnd = lower.indexOf(">", trStart);
    if (trOpenEnd === -1 || trOpenEnd >= endIdx) break;

    const trCloseStart = lower.indexOf("</tr>", trOpenEnd + 1);
    if (trCloseStart === -1) break;

    const trEnd = trCloseStart + "</tr>".length;
    if (trEnd > endIdx) break;

    rows.push({
      text: input.slice(trStart, trEnd),
      startIdx: trStart,
      endIdx: trEnd,
    });
    cursor = trEnd;
  }

  return rows;
};

const splitHtmlTable = (input: string): ParsedTable | null => {
  const lower = input.toLowerCase();

  const tbodyOpenStart = lower.indexOf("<tbody");
  let rowSearchStart = 0;
  let rowSearchEnd = input.length;

  if (tbodyOpenStart !== -1) {
    const tbodyOpenEnd = lower.indexOf(">", tbodyOpenStart);
    if (tbodyOpenEnd === -1) return null;
    rowSearchStart = tbodyOpenEnd + 1;
    const tbodyCloseStart = lower.indexOf("</tbody>", rowSearchStart);
    rowSearchEnd = tbodyCloseStart === -1 ? input.length : tbodyCloseStart;
  }

  const rows = findHtmlRowsInRange(input, rowSearchStart, rowSearchEnd);
  if (rows.length === 0) return null;
  const first = rows.at(0);
  const last = rows.at(-1);
  if (!first || !last) return null;
  return {
    header: input.slice(0, first.startIdx),
    rows,
    footer: input.slice(last.endIdx),
  };
};

export type TableChunkerConfig = {
  chunkSize: number;
  mode: TableChunkerMode;
  format: TableFormat;
};

export const TableChunkerConfig = ServiceMap.Reference<TableChunkerConfig>(
  "TableChunkerConfig",
  {
    defaultValue: () => ({
      chunkSize: 3,
      mode: "row",
      format: "auto",
    }),
  },
);

const isValidConfig = (config: TableChunkerConfig): boolean =>
  config.chunkSize > 0;

export class TableChunker extends ServiceMap.Service<Chunker>()(
  "TableChunker",
  {
    make: Effect.gen(function* () {
      const tokenizer = yield* Tokenizer;
      const config = yield* TableChunkerConfig;

      if (!isValidConfig(config)) {
        return yield* Effect.fail(
          new ChunkError({ message: "Invalid table chunker config" }),
        );
      }

      const toTokenModeChunks = (
        table: ParsedTable,
        chunkSize: number,
      ): Effect.Effect<Array<Chunk>, TokenizerError> =>
        Effect.gen(function* () {
          const header = yield* tokenizer.countTokens(table.header);
          const footer =
            table.footer.length > 0
              ? yield* tokenizer.countTokens(table.footer)
              : 0;

          const baseTokens = header + footer;
          const chunks: Chunk[] = [];
          let currentRows: RowSlice[] = [];
          let currentTokens = 0;

          const flushCurrent = Effect.fn(function* () {
            if (currentRows.length === 0) return;
            const first = currentRows[0];
            const last = currentRows[currentRows.length - 1];
            if (!first || !last) return;
            const chunkText =
              table.header +
              currentRows.map((row) => row.text).join("") +
              table.footer;
            chunks.push({
              text: chunkText,
              startIdx: first.startIdx,
              endIdx: last.endIdx,
              tokenCount: baseTokens + currentTokens,
            });
            currentRows = [];
            currentTokens = 0;
          });

          for (const row of table.rows) {
            const rowTokens = yield* tokenizer.countTokens(row.text);
            const wouldExceed =
              baseTokens + currentTokens + rowTokens > chunkSize;
            // If current chunk already has rows and next row would exceed budget, flush.
            if (wouldExceed && currentRows.length > 0) {
              yield* flushCurrent();
            }
            // Always add at least one row, even if it alone exceeds chunk size.
            currentRows.push(row);
            currentTokens += rowTokens;
          }
          yield* flushCurrent();
          return chunks;
        });

      const chunk = Effect.fn(function* (input: string) {
        if (input.trim().length === 0) return [];
        const format = detectFormat(input, config.format);
        const parsed =
          format === "markdown"
            ? splitMarkdownTable(input)
            : splitHtmlTable(input);
        switch (format) {
          case "html": {
            if (!parsed) return [];
            switch (config.mode) {
              case "row": {
                const rowGroups = chunkRowsBySize(
                  parsed.rows,
                  config.chunkSize,
                );
                return rowGroups.flatMap((rows) => {
                  const built = toRowModeChunk({
                    header: parsed.header,
                    rows,
                    footer: parsed.footer,
                  });
                  return built ? [built] : [];
                });
              }
              case "token": {
                return yield* toTokenModeChunks(parsed, config.chunkSize);
              }
            }
            break;
          }
          case "markdown": {
            if (!parsed) return [];
            switch (config.mode) {
              case "row": {
                const rowGroups = chunkRowsBySize(
                  parsed.rows,
                  config.chunkSize,
                );
                return rowGroups.flatMap((r) => {
                  const build = toRowModeChunk({
                    header: parsed.header,
                    rows: r,
                    footer: parsed.footer,
                  });
                  return build ? [build] : [];
                });
              }
              case "token": {
                return yield* toTokenModeChunks(parsed, config.chunkSize);
              }
            }
          }
        }
      });

      return { chunk, name: "table" };
    }),
  },
) {}

export const TableChunkerLive = Layer.effect(Chunker)(TableChunker.make).pipe(
  Layer.provide(WordTokenizerLive),
);
