import { type Chunk, ChunkError, Chunker } from "@repo/domain/Chunk";
import { Effect, Layer, ServiceMap } from "effect";

export const FastChunkerConfig = ServiceMap.Reference("FastChunkerConfig", {
  defaultValue: () => ({
    chunkSize: 4096,
    delimiters: ["\n", ".", "?"],
  }),
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const isContinuationByte = (byte: number): boolean =>
  (byte & 0b1100_0000) === 0b1000_0000;

const isDelimiter = (byte: number, delimiters: string[]): boolean =>
  delimiters.includes(String.fromCharCode(byte));

export class FastChunker extends ServiceMap.Service<Chunker>()("FastChunker", {
  make: Effect.gen(function* () {
    const { chunkSize, delimiters } = yield* FastChunkerConfig;

    if (chunkSize <= 0) {
      return yield* Effect.fail(
        new ChunkError({
          message: "Invalid fast chunker config",
        }),
      );
    }

    const findSplit = (
      bytes: Uint8Array,
      start: number,
      targetEnd: number,
      delimiters: string[],
    ): number => {
      const maxEnd = Math.min(targetEnd, bytes.length);

      for (let i = maxEnd - 1; i > start; i--) {
        if (isDelimiter(bytes[i] as number, delimiters)) {
          return i + 1;
        }
      }

      return maxEnd;
    };

    const alignUtf8Boundary = (
      bytes: Uint8Array,
      start: number,
      end: number,
    ): number => {
      if (end >= bytes.length) {
        return bytes.length;
      }

      let aligned = end;
      while (aligned > start && isContinuationByte(bytes[aligned] as number)) {
        aligned--;
      }

      if (aligned > start) {
        return aligned;
      }

      aligned = end;
      while (
        aligned < bytes.length &&
        isContinuationByte(bytes[aligned] as number)
      ) {
        aligned++;
      }

      return aligned;
    };

    const chunk = Effect.fn("FastChunker.chunk")(function* (text: string) {
      if (chunkSize <= 0) {
        return yield* Effect.fail(
          new ChunkError({
            message: "Invalid fast chunker config",
          }),
        );
      }

      if (text.trim().length === 0) {
        return [];
      }
      const bytes = encoder.encode(text);
      const chunks: Array<Chunk> = [];
      let start = 0;
      let charIndex = 0;

      while (start < bytes.length) {
        const target = start + chunkSize;
        const split = findSplit(bytes, start, target, delimiters);
        const end = alignUtf8Boundary(bytes, start, split);

        const textSlice = decoder.decode(bytes.slice(start, end));
        chunks.push({
          text: textSlice,
          startIdx: charIndex,
          endIdx: charIndex + textSlice.length,
          tokenCount: textSlice.length,
        });

        charIndex += textSlice.length;
        start = end;
      }

      return chunks;
    });

    return {
      chunk,
      name: "fast",
    };
  }),
}) {}

export const FastChunkerLive = Layer.effect(Chunker)(FastChunker.make);
