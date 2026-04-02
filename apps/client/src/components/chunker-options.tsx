import type { Dispatch, FC, SetStateAction } from "react";
import type {
  ChunkerKind,
  FastChunkerSettings,
  NonEmptyArray,
  SentenceChunkerSettings,
} from "@/lib/atoms/chunker-atom";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const includeDelimOptions: Array<SentenceChunkerSettings["includeDelim"]> = [
  "prev",
  "next",
  null,
];

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sliderValue = (value: number | ReadonlyArray<number>) =>
  Array.isArray(value) ? (value[0] ?? 0) : value;

const ensureNonEmpty = (
  value: ReadonlyArray<string>,
  fallback: NonEmptyArray<string>,
): NonEmptyArray<string> =>
  (value.length > 0 ? value : fallback) as NonEmptyArray<string>;

const parseDelimiters = (value: string, fallback: NonEmptyArray<string>) => {
  const normalized = value.replace(/\\n/g, "\n");
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return ensureNonEmpty(parts, fallback);
};

const formatDelimiters = (delimiters: ReadonlyArray<string>) =>
  delimiters.map((value) => value.replace(/\n/g, "\\n")).join(", ");

export type ChunkerOptionsProps = {
  type: ChunkerKind;
  fastConfig: FastChunkerSettings;
  setFastConfig: Dispatch<SetStateAction<FastChunkerSettings>>;
  sentenceConfig: SentenceChunkerSettings;
  setSentenceConfig: Dispatch<SetStateAction<SentenceChunkerSettings>>;
};

export const ChunkerOptions: FC<ChunkerOptionsProps> = ({
  type,
  fastConfig,
  setFastConfig,
  sentenceConfig,
  setSentenceConfig,
}) => {
  const delimiterPreview = formatDelimiters(
    type === "fast" ? fastConfig.delimiters : sentenceConfig.delimiters,
  );
  switch (type) {
    case "fast":
      return (
        <FieldGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="fast-chunk-size">Chunk size</FieldLabel>
            <Input
              id="fast-chunk-size"
              type="number"
              min={1}
              value={fastConfig.chunkSize}
              onChange={(event) =>
                setFastConfig((prev) => ({
                  ...prev,
                  chunkSize: parseNumber(event.target.value, prev.chunkSize),
                }))
              }
            />
            <Slider
              aria-label="Fast chunk size"
              value={[fastConfig.chunkSize]}
              min={10}
              max={2000}
              step={5}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setFastConfig((prev) => ({
                  ...prev,
                  chunkSize: next,
                }));
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fast-delimiters">Delimiters</FieldLabel>
            <Input
              id="fast-delimiters"
              value={delimiterPreview}
              onChange={(event) =>
                setFastConfig((prev) => ({
                  ...prev,
                  delimiters: parseDelimiters(
                    event.target.value,
                    prev.delimiters,
                  ),
                }))
              }
            />
          </Field>
        </FieldGroup>
      );
    case "sentence":
      return (
        <FieldGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sentence-chunk-size">Chunk size</FieldLabel>
            <Input
              id="sentence-chunk-size"
              type="number"
              min={1}
              value={sentenceConfig.chunkSize}
              onChange={(event) =>
                setSentenceConfig((prev) => ({
                  ...prev,
                  chunkSize: parseNumber(event.target.value, prev.chunkSize),
                }))
              }
            />
            <Slider
              aria-label="Sentence chunk size"
              value={[sentenceConfig.chunkSize]}
              min={10}
              max={2000}
              step={5}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setSentenceConfig((prev) => ({
                  ...prev,
                  chunkSize: next,
                }));
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sentence-chunk-overlap">Overlap</FieldLabel>
            <Input
              id="sentence-chunk-overlap"
              type="number"
              min={0}
              value={sentenceConfig.chunkOverlap}
              onChange={(event) =>
                setSentenceConfig((prev) => ({
                  ...prev,
                  chunkOverlap: parseNumber(
                    event.target.value,
                    prev.chunkOverlap,
                  ),
                }))
              }
            />
            <Slider
              aria-label="Sentence chunk overlap"
              value={[sentenceConfig.chunkOverlap]}
              min={0}
              max={Math.max(0, sentenceConfig.chunkSize - 1)}
              step={1}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setSentenceConfig((prev) => ({
                  ...prev,
                  chunkOverlap: next,
                }));
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="sentence-delimiters">Delimiters</FieldLabel>
            <Input
              id="sentence-delimiters"
              value={delimiterPreview}
              onChange={(event) =>
                setSentenceConfig((prev) => ({
                  ...prev,
                  delimiters: parseDelimiters(
                    event.target.value,
                    prev.delimiters,
                  ),
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="include-delimiter">
              Include delimiter
            </FieldLabel>
            <ToggleGroup
              value={[sentenceConfig.includeDelim ?? "none"]}
              id="include-delimiter"
            >
              {includeDelimOptions.map((option) => (
                <ToggleGroupItem
                  key={option ?? "none"}
                  variant="outline"
                  className="flex-1"
                  value={option ?? "none"}
                  onClick={() =>
                    setSentenceConfig((prev) => ({
                      ...prev,
                      includeDelim: option,
                    }))
                  }
                >
                  {option ?? "none"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      );
    default:
      return null;
  }
};
