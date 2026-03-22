import {
  Array,
  Effect,
  Layer,
  Option,
  pipe,
  Record,
  ServiceMap,
  String,
} from "effect";
import { PDFParse } from "pdf-parse";

const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 120;
const BASE_CHUNK_CHARS = Math.max(1, MAX_CHUNK_CHARS - CHUNK_OVERLAP);

type ChunkEntry = {
  text: string;
  pageNumber?: number;
  pageCount?: number;
};

export class ChunkService extends ServiceMap.Service<ChunkService>()(
  "ChunkService",
  {
    make: Effect.gen(function* () {
      const normalizeWhitespace = (text: string) =>
        pipe(
          text,
          String.replaceAll(/\r\n/g, "\n"),
          String.replaceAll(/[\t\f\v]+/g, " "),
          String.replaceAll(/[ ]{2,}/g, " "),
          String.replaceAll(/\n{3,}/g, "\n\n"),
          String.trim,
        );

      const splitLines = (text: string): string[] =>
        pipe(
          normalizeWhitespace(text),
          String.split("\n"),
          Array.map(String.trim),
          Array.filter(String.isNonEmpty),
        );

      const splitByLength = (text: string, maxLength: number): string[] =>
        text.length <= maxLength
          ? [text]
          : Array.unfold(0, (index) =>
              index >= text.length
                ? Option.none()
                : Option.some([
                    text.slice(index, index + maxLength),
                    index + maxLength,
                  ]),
            );

      const splitBySeparators = (
        text: string,
        separators: string[],
        maxLength: number,
      ): string[] => {
        const normalized = normalizeWhitespace(text);
        if (String.isEmpty(normalized)) {
          return [];
        }

        if (String.length(normalized) <= maxLength) {
          return [normalized];
        }

        return Array.match(separators, {
          onEmpty: () => splitByLength(normalized, maxLength),
          onNonEmpty: ([separator, ...rest]) => {
            if (String.isEmpty(separator)) {
              return splitByLength(normalized, maxLength);
            }

            if (!pipe(normalized, String.includes(separator))) {
              return splitBySeparators(normalized, rest, maxLength);
            }

            return pipe(
              normalized,
              String.split(separator),
              Array.flatMap((part) => {
                const trimmed = String.trim(part);
                if (String.isEmpty(trimmed)) {
                  return [];
                }

                return String.length(trimmed) <= maxLength
                  ? [trimmed]
                  : splitBySeparators(trimmed, rest, maxLength);
              }),
            );
          },
        });
      };

      const splitTextWithOverlap = (text: string) => {
        const baseChunks = splitBySeparators(
          text,
          ["\n\n", "\n", ". ", " "],
          BASE_CHUNK_CHARS,
        );

        if (CHUNK_OVERLAP <= 0 || baseChunks.length <= 1) {
          return baseChunks;
        }

        return pipe(
          baseChunks,
          Array.map((chunk, index) => {
            if (index === 0) {
              return chunk;
            }
            const previous = baseChunks[index - 1];
            if (!previous) {
              return chunk;
            }
            const overlap = String.takeRight(previous, CHUNK_OVERLAP);
            return String.trim(`${overlap}${chunk}`);
          }),
          Array.filter(String.isNonEmpty),
        );
      };

      const chunkCsv = (text: string): ChunkEntry[] => {
        const lines = splitLines(text);
        return lines.flatMap((line) =>
          splitByLength(line, MAX_CHUNK_CHARS).map((chunk) => ({
            text: chunk,
          })),
        );
      };

      const chunkPdfPages = (
        pages: string[],
        fallbackText: string,
      ): ChunkEntry[] => {
        if (pages.length === 0) {
          return splitTextWithOverlap(fallbackText).map((chunk) => ({
            text: chunk,
          }));
        }

        const pageCount = pages.length;
        return pages.flatMap((pageText, index) =>
          splitTextWithOverlap(pageText).map((chunk) => ({
            text: chunk,
            pageNumber: index + 1,
            pageCount,
          })),
        );
      };

      const chunkText = (
        fileName: string,
        text: string,
        pages?: string[],
      ): ChunkEntry[] => {
        const extension = getFileExtension(fileName);
        switch (extension) {
          case ".csv":
            return chunkCsv(text);
          case ".pdf":
            return chunkPdfPages(pages ?? [], text);
          case ".txt":
          case ".md":
            return splitTextWithOverlap(text).map((chunk) => ({ text: chunk }));
          default:
            return [];
        }
      };

      const getFileExtension = (fileName: string) =>
        pipe(fileName, String.split("."), (parts) =>
          parts.length < 2
            ? ""
            : pipe(
                parts,
                Array.last,
                Option.getOrElse(() => ""),
                String.toLowerCase,
                (extension) => `.${extension}`,
              ),
        );

      const resolveMimeType = (extension: string) => {
        const mimeTypes = {
          ".pdf": "application/pdf",
          ".txt": "text/plain",
          ".md": "text/markdown",
          ".csv": "text/csv",
        } as const;

        return pipe(
          mimeTypes,
          Record.get(extension as keyof typeof mimeTypes),
          Option.getOrElse(() => "application/octet-stream"),
        );
      };

      const truncatePreview = (value: string, maxLength: number) =>
        String.length(value) > maxLength
          ? `${String.takeLeft(value, maxLength)}...`
          : value;

      const logIngestError = (
        fileName: string,
        fileId: string,
        error: unknown,
      ) => {
        if (error instanceof Error) {
          return Effect.logError(
            `Upload ingest failed for ${fileName} (ID: ${fileId}): ${error.name}: ${error.message}`,
          );
        }

        let serialized: string | null = null;
        try {
          serialized = JSON.stringify(error);
        } catch {
          serialized = null;
        }

        return Effect.logError(
          `Upload ingest failed for ${fileName} (ID: ${fileId}): ${serialized ?? globalThis.String(error)}`,
        );
      };

      const extractText = (fileName: string, buffer: Buffer) => {
        const extension = getFileExtension(fileName);
        switch (extension) {
          case ".txt":
          case ".md":
          case ".csv":
            return Effect.succeed({
              text: normalizeWhitespace(buffer.toString("utf8")),
              pages: undefined,
            });
          case ".pdf":
            return Effect.tryPromise({
              try: async () => {
                const parser = new PDFParse({ data: buffer });
                try {
                  const result = await parser.getText();
                  const normalizedText = normalizeWhitespace(result.text ?? "");
                  return {
                    text: normalizedText,
                    pages: undefined,
                  } as const;
                } finally {
                  await parser.destroy();
                }
              },
              catch: (error) =>
                new Error(
                  `PDF parse failed for ${fileName}: ${error instanceof Error ? error.message : globalThis.String(error)}`,
                ),
            });
          default:
            return Effect.fail(new Error(`Unsupported file type: ${fileName}`));
        }
      };

      return {
        chunkText,
        resolveMimeType,
        getFileExtension,
        truncatePreview,
        logIngestError,
        extractText,
      } as const;
    }),
  },
) {
  static Default = Layer.effect(ChunkService)(ChunkService.make);
}
