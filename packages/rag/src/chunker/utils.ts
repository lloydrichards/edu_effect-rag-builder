import { Schema } from "effect";

export const IncludeDelim = Schema.NullOr(Schema.Literals(["prev", "next"]));
export type IncludeDelim = typeof IncludeDelim.Type;

export const TextSpan = Schema.Struct({
  text: Schema.String,
  startIdx: Schema.Number,
  endIdx: Schema.Number,
});

export const isBlank = (text: string): boolean => text.trim().length === 0;

export const buildDelimiterPattern = (
  delimiters: ReadonlyArray<string>,
): RegExp =>
  new RegExp(
    delimiters
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g",
  );

export const findDelimiterSpans = (
  text: string,
  pattern: RegExp,
): Array<typeof TextSpan.Type> =>
  Array.from(text.matchAll(pattern)).flatMap((match) => {
    const raw = match[0];
    const startIdx = match.index;
    if (raw === undefined || startIdx === undefined) return [];
    return [{ text: raw, startIdx, endIdx: startIdx + raw.length }];
  });

export const splitTextByMatches = (
  text: string,
  matches: ReadonlyArray<typeof TextSpan.Type>,
  includeDelim: IncludeDelim,
): Array<typeof TextSpan.Type> => {
  if (matches.length === 0) {
    return text.length === 0
      ? []
      : [{ text, startIdx: 0, endIdx: text.length }];
  }

  const parts: Array<typeof TextSpan.Type> = [];

  switch (includeDelim) {
    case "prev": {
      let cursor = 0;
      for (const match of matches) {
        parts.push({
          text: text.slice(cursor, match.endIdx),
          startIdx: cursor,
          endIdx: match.endIdx,
        });
        cursor = match.endIdx;
      }
      if (cursor < text.length) {
        parts.push({
          text: text.slice(cursor),
          startIdx: cursor,
          endIdx: text.length,
        });
      }
      break;
    }
    case "next": {
      const first = matches[0];
      if (first !== undefined) {
        parts.push({
          text: text.slice(0, first.startIdx),
          startIdx: 0,
          endIdx: first.startIdx,
        });
      }
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        if (current === undefined) continue;
        const next = matches[i + 1];
        const endIdx = next?.startIdx ?? text.length;
        parts.push({
          text: text.slice(current.startIdx, endIdx),
          startIdx: current.startIdx,
          endIdx,
        });
      }
      break;
    }
    default: {
      let cursor = 0;
      for (const match of matches) {
        parts.push({
          text: text.slice(cursor, match.startIdx),
          startIdx: cursor,
          endIdx: match.startIdx,
        });
        cursor = match.endIdx;
      }
      if (cursor <= text.length) {
        parts.push({
          text: text.slice(cursor),
          startIdx: cursor,
          endIdx: text.length,
        });
      }
    }
  }

  return parts.filter((part) => part.text.length > 0);
};

export const splitLines = (input: string): Array<typeof TextSpan.Type> => {
  const lines: Array<typeof TextSpan.Type> = [];
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
