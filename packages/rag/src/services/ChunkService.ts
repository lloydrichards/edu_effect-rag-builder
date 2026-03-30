import type { ChunkError, TokenizerError } from "@repo/domain/Chunk";
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
import { extractText as extractPdfText } from "unpdf";
import { FastChunker } from "../chunker/FastChunker";
import { RecursiveChunker } from "../chunker/RecursiveChunker";
import { SentenceChunker } from "../chunker/SentenceChunker";
import { TableChunker } from "../chunker/TableChunker";
import { TokenChunker } from "../chunker/TokenChunker";
import { CharacterTokenizerLive } from "../tokenizer/DelimTokenizer";

const FAST_CHUNK_THRESHOLD_CHARS = 100_000;

type ChunkStrategy = "fast" | "sentence" | "token" | "recursive" | "table";

type ChunkEntry = {
  text: string;
  pageNumber?: number;
  pageCount?: number;
};

type MarkdownSegment = {
  kind: "text" | "table";
  text: string;
};

export class ChunkService extends ServiceMap.Service<ChunkService>()(
  "ChunkService",
  {
    make: Effect.gen(function* () {
      const fastChunker = yield* FastChunker;
      const sentenceChunker = yield* SentenceChunker;
      const tokenChunker = yield* TokenChunker;
      const recursiveChunker = yield* RecursiveChunker;
      const tableChunker = yield* TableChunker;

      const normalizeWhitespace = (text: string) =>
        pipe(
          text,
          String.replaceAll(/\r\n/g, "\n"),
          String.replaceAll(/[\t\f\v]+/g, " "),
          String.replaceAll(/[ ]{2,}/g, " "),
          String.replaceAll(/\n{3,}/g, "\n\n"),
          String.trim,
        );

      const toChunkEntries = (
        texts: ReadonlyArray<string>,
        metadata?: { pageNumber?: number; pageCount?: number },
      ): Array<ChunkEntry> =>
        pipe(
          texts,
          Array.map((value) => String.trim(value)),
          Array.filter(String.isNonEmpty),
          Array.map((text) => ({ text, ...metadata })),
        );

      const chunkWithStrategy = (
        strategy: ChunkStrategy,
        text: string,
      ): Effect.Effect<Array<string>, ChunkError | TokenizerError> => {
        switch (strategy) {
          case "fast":
            return Effect.map(fastChunker.chunk(text), (chunks) =>
              chunks.map((chunk) => chunk.text),
            );
          case "sentence":
            return Effect.map(sentenceChunker.chunk(text), (chunks) =>
              chunks.map((chunk) => chunk.text),
            );
          case "token":
            return Effect.map(tokenChunker.chunk(text), (chunks) =>
              chunks.map((chunk) => chunk.text),
            );
          case "recursive":
            return Effect.map(recursiveChunker.chunk(text), (chunks) =>
              chunks.map((chunk) => chunk.text),
            );
          case "table":
            return Effect.map(tableChunker.chunk(text), (chunks) =>
              chunks.map((chunk) => chunk.text),
            );
        }
      };

      const looksLikeMarkdownTable = (text: string): boolean => {
        const hasPipeRow = /^\s*\|.*\|\s*$/m.test(text);
        const hasSeparator =
          /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text);
        return hasPipeRow && hasSeparator;
      };

      const isMarkdownTableSeparatorLine = (line: string): boolean =>
        /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

      const isPipeLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);

      const splitMarkdownSegments = (text: string): Array<MarkdownSegment> => {
        const lines = text.split("\n");
        const segments: Array<MarkdownSegment> = [];
        const proseBuffer: Array<string> = [];

        const flushProse = () => {
          if (proseBuffer.length === 0) return;
          segments.push({ kind: "text", text: proseBuffer.join("\n") });
          proseBuffer.length = 0;
        };

        for (let i = 0; i < lines.length; i++) {
          const header = lines[i] ?? "";
          const separator = lines[i + 1] ?? "";

          const isTableStart =
            isPipeLine(header) && isMarkdownTableSeparatorLine(separator);

          if (!isTableStart) {
            proseBuffer.push(header);
            continue;
          }

          flushProse();

          const tableLines = [header, separator];
          i += 2;

          while (i < lines.length && isPipeLine(lines[i] ?? "")) {
            tableLines.push(lines[i] ?? "");
            i += 1;
          }

          segments.push({
            kind: "table",
            text: `${tableLines.join("\n")}\n`,
          });

          i -= 1;
        }

        flushProse();

        return segments.filter((segment) =>
          String.isNonEmpty(String.trim(segment.text)),
        );
      };

      const selectStrategy = (
        extension: string,
        normalizedText: string,
      ): Option.Option<ChunkStrategy> => {
        switch (extension) {
          case ".csv":
            return Option.some("token");
          case ".md":
            return Option.some(
              looksLikeMarkdownTable(normalizedText) ? "table" : "recursive",
            );
          case ".pdf":
          case ".txt":
            return Option.some(
              normalizedText.length >= FAST_CHUNK_THRESHOLD_CHARS
                ? "fast"
                : "sentence",
            );
          default:
            return Option.none();
        }
      };

      const chunkMarkdownText = (
        normalizedText: string,
      ): Effect.Effect<Array<ChunkEntry>, ChunkError | TokenizerError> =>
        Effect.gen(function* () {
          const segments = splitMarkdownSegments(normalizedText);
          const allEntries = yield* Effect.forEach(segments, (segment) =>
            segment.kind === "table"
              ? Effect.map(chunkWithStrategy("table", segment.text), (texts) =>
                  toChunkEntries(texts),
                )
              : Effect.map(
                  chunkWithStrategy("recursive", segment.text),
                  (texts) => toChunkEntries(texts),
                ),
          );

          return allEntries.flat();
        });

      const chunkNormalizedText = (
        extension: string,
        normalizedText: string,
      ): Effect.Effect<Array<ChunkEntry>, ChunkError | TokenizerError> =>
        pipe(
          selectStrategy(extension, normalizedText),
          Option.match({
            onNone: () => Effect.succeed([] as Array<ChunkEntry>),
            onSome: (strategy) =>
              Effect.map(chunkWithStrategy(strategy, normalizedText), (texts) =>
                toChunkEntries(texts),
              ),
          }),
        );

      const chunkPdfPages = (
        pages: Array<string>,
        fallbackText: string,
      ): Effect.Effect<Array<ChunkEntry>, ChunkError | TokenizerError> => {
        if (pages.length === 0) {
          return chunkNormalizedText(".pdf", normalizeWhitespace(fallbackText));
        }

        const pageCount = pages.length;
        return Effect.forEach(pages, (pageText, index) =>
          Effect.map(
            chunkNormalizedText(".pdf", normalizeWhitespace(pageText)),
            (entries) =>
              entries.map((entry) => ({
                ...entry,
                pageNumber: index + 1,
                pageCount,
              })),
          ),
        ).pipe(Effect.map((pagesWithChunks) => pagesWithChunks.flat()));
      };

      const chunkText = (
        fileName: string,
        text: string,
        pages?: Array<string>,
      ): Effect.Effect<Array<ChunkEntry>, ChunkError | TokenizerError> => {
        const extension = getFileExtension(fileName);
        switch (extension) {
          case ".pdf":
            return chunkPdfPages(pages ?? [], text);
          case ".csv":
          case ".txt":
            return chunkNormalizedText(extension, normalizeWhitespace(text));
          case ".md":
            return chunkMarkdownText(normalizeWhitespace(text));
          default:
            return Effect.succeed([] as Array<ChunkEntry>);
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

      const resolveMimeTypeForFile = (fileName: string) => {
        const extension = getFileExtension(fileName);
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

      const extractText = (fileName: string, buffer: Buffer) => {
        const extension = getFileExtension(fileName);
        switch (extension) {
          case ".txt":
          case ".md":
          case ".csv":
            return Effect.succeed({
              text: buffer.toString("utf8"),
              pages: undefined,
            });
          case ".pdf":
            return Effect.tryPromise({
              try: async () => {
                const result = await extractPdfText(new Uint8Array(buffer), {
                  mergePages: true,
                });
                return {
                  text: normalizeWhitespace(result.text),
                  pages: undefined,
                } as const;
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
        resolveMimeTypeForFile,
        extractText,
      } as const;
    }),
  },
) {
  static Default = Layer.effect(ChunkService, ChunkService.make).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.effect(FastChunker, FastChunker.make),
        Layer.effect(SentenceChunker, SentenceChunker.make),
        Layer.effect(TokenChunker, TokenChunker.make),
        Layer.effect(RecursiveChunker, RecursiveChunker.make),
        Layer.effect(TableChunker, TableChunker.make),
      ).pipe(Layer.provide(CharacterTokenizerLive)),
    ),
  );
}
