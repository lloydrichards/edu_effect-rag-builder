export type IncludeDelim = "prev" | "next" | null;

export type TextSpan = {
  text: string;
  startIdx: number;
  endIdx: number;
};

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
): Array<TextSpan> =>
  Array.from(text.matchAll(pattern)).flatMap((match) => {
    const raw = match[0];
    const startIdx = match.index;
    if (raw === undefined || startIdx === undefined) return [];
    return [{ text: raw, startIdx, endIdx: startIdx + raw.length }];
  });

export const splitTextByMatches = (
  text: string,
  matches: ReadonlyArray<TextSpan>,
  includeDelim: IncludeDelim,
): Array<TextSpan> => {
  if (matches.length === 0) {
    return text.length === 0
      ? []
      : [{ text, startIdx: 0, endIdx: text.length }];
  }

  const parts: Array<TextSpan> = [];

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
