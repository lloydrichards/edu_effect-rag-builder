import type { Dispatch, FC, SetStateAction } from "react";
import type {
  ChunkerKind,
  FastChunkerSettings,
  NonEmptyArray,
  RecursiveChunkerRule,
  RecursiveChunkerSettings,
  SentenceChunkerSettings,
  TableChunkerSettings,
  TokenChunkerSettings,
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
  recursiveConfig: RecursiveChunkerSettings;
  setRecursiveConfig: Dispatch<SetStateAction<RecursiveChunkerSettings>>;
  tokenConfig: TokenChunkerSettings;
  setTokenConfig: Dispatch<SetStateAction<TokenChunkerSettings>>;
  tableConfig: TableChunkerSettings;
  setTableConfig: Dispatch<SetStateAction<TableChunkerSettings>>;
};

export const ChunkerOptions: FC<ChunkerOptionsProps> = ({
  type,
  fastConfig,
  setFastConfig,
  sentenceConfig,
  setSentenceConfig,
  recursiveConfig,
  setRecursiveConfig,
  tokenConfig,
  setTokenConfig,
  tableConfig,
  setTableConfig,
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
    case "token":
      return (
        <FieldGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="token-chunk-size">Chunk size</FieldLabel>
            <Input
              id="token-chunk-size"
              type="number"
              min={1}
              value={tokenConfig.chunkSize}
              onChange={(event) =>
                setTokenConfig((prev) => ({
                  ...prev,
                  chunkSize: parseNumber(event.target.value, prev.chunkSize),
                }))
              }
            />
            <Slider
              aria-label="Token chunk size"
              value={[tokenConfig.chunkSize]}
              min={10}
              max={4096}
              step={8}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setTokenConfig((prev) => ({
                  ...prev,
                  chunkSize: next,
                }));
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="token-chunk-overlap">Overlap</FieldLabel>
            <Input
              id="token-chunk-overlap"
              type="number"
              min={0}
              value={tokenConfig.chunkOverlap}
              onChange={(event) =>
                setTokenConfig((prev) => ({
                  ...prev,
                  chunkOverlap: parseNumber(
                    event.target.value,
                    prev.chunkOverlap,
                  ),
                }))
              }
            />
            <Slider
              aria-label="Token chunk overlap"
              value={[tokenConfig.chunkOverlap]}
              min={0}
              max={Math.max(0, tokenConfig.chunkSize - 1)}
              step={1}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setTokenConfig((prev) => ({
                  ...prev,
                  chunkOverlap: next,
                }));
              }}
            />
          </Field>
        </FieldGroup>
      );
    case "table":
      return (
        <FieldGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="table-chunk-size">Chunk size</FieldLabel>
            <Input
              id="table-chunk-size"
              type="number"
              min={1}
              value={tableConfig.chunkSize}
              onChange={(event) =>
                setTableConfig((prev) => ({
                  ...prev,
                  chunkSize: parseNumber(event.target.value, prev.chunkSize),
                }))
              }
            />
            <Slider
              aria-label="Table chunk size"
              value={[tableConfig.chunkSize]}
              min={1}
              max={50}
              step={1}
              onValueChange={(value) => {
                const next = sliderValue(value);
                setTableConfig((prev) => ({
                  ...prev,
                  chunkSize: next,
                }));
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="table-mode">Mode</FieldLabel>
            <ToggleGroup value={[tableConfig.mode]} id="table-mode">
              {(["row", "token"] as const).map((option) => (
                <ToggleGroupItem
                  key={option}
                  variant="outline"
                  className="flex-1"
                  value={option}
                  onClick={() =>
                    setTableConfig((prev) => ({
                      ...prev,
                      mode: option,
                    }))
                  }
                >
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="table-format">Format</FieldLabel>
            <ToggleGroup value={[tableConfig.format]} id="table-format">
              {(["auto", "markdown", "html"] as const).map((option) => (
                <ToggleGroupItem
                  key={option}
                  variant="outline"
                  className="flex-1"
                  value={option}
                  onClick={() =>
                    setTableConfig((prev) => ({
                      ...prev,
                      format: option,
                    }))
                  }
                >
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      );
    case "recursive":
      return (
        <RecursiveOptions
          config={recursiveConfig}
          setConfig={setRecursiveConfig}
        />
      );
    default:
      return null;
  }
};

const defaultRuleDelimiters = ["\n\n"] as NonEmptyArray<string>;

const RuleModeLabels = {
  delimiter: "Delimiter",
  whitespace: "Whitespace",
  fallback: "Fallback",
} as const;

const buildRuleLabel = (rule: RecursiveChunkerRule, index: number) => {
  if (rule.whitespace) return `${RuleModeLabels.whitespace} ${index + 1}`;
  if (rule.delimiters && rule.delimiters.length > 0) {
    return `${RuleModeLabels.delimiter} ${index + 1}`;
  }
  return `${RuleModeLabels.fallback} ${index + 1}`;
};

const parseRuleDelimiters = (
  value: string,
  fallback: NonEmptyArray<string>,
): NonEmptyArray<string> => parseDelimiters(value, fallback);

const ensureNonEmptyRules = (
  value: ReadonlyArray<RecursiveChunkerRule>,
  fallback: NonEmptyArray<RecursiveChunkerRule>,
): NonEmptyArray<RecursiveChunkerRule> =>
  (value.length > 0 ? value : fallback) as NonEmptyArray<RecursiveChunkerRule>;

const toDelimiterRule = (item: RecursiveChunkerRule): RecursiveChunkerRule => ({
  delimiters:
    item.delimiters && item.delimiters.length > 0
      ? item.delimiters
      : defaultRuleDelimiters,
  includeDelim: item.includeDelim ?? "prev",
});

const toWhitespaceRule = (
  item: RecursiveChunkerRule,
): RecursiveChunkerRule => ({
  whitespace: true,
  includeDelim: item.includeDelim ?? "prev",
});

const RecursiveOptions = ({
  config,
  setConfig,
}: {
  config: RecursiveChunkerSettings;
  setConfig: Dispatch<SetStateAction<RecursiveChunkerSettings>>;
}) => {
  return (
    <FieldGroup className="flex flex-col gap-3">
      <FieldGroup className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="recursive-chunk-size">Chunk size</FieldLabel>
          <Input
            id="recursive-chunk-size"
            type="number"
            min={1}
            value={config.chunkSize}
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                chunkSize: parseNumber(event.target.value, prev.chunkSize),
              }))
            }
          />
          <Slider
            aria-label="Recursive chunk size"
            value={[config.chunkSize]}
            min={10}
            max={4096}
            step={16}
            onValueChange={(value) => {
              const next = sliderValue(value);
              setConfig((prev) => ({
                ...prev,
                chunkSize: next,
              }));
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="recursive-min-chars">
            Min characters per chunk
          </FieldLabel>
          <Input
            id="recursive-min-chars"
            type="number"
            min={1}
            value={config.minCharactersPerChunk}
            onChange={(event) =>
              setConfig((prev) => ({
                ...prev,
                minCharactersPerChunk: parseNumber(
                  event.target.value,
                  prev.minCharactersPerChunk,
                ),
              }))
            }
          />
          <Slider
            aria-label="Recursive minimum characters"
            value={[config.minCharactersPerChunk]}
            min={1}
            max={200}
            step={1}
            onValueChange={(value) => {
              const next = sliderValue(value);
              setConfig((prev) => ({
                ...prev,
                minCharactersPerChunk: next,
              }));
            }}
          />
        </Field>
      </FieldGroup>

      {config.rules.map((rule, index) => {
        const ruleLabel = buildRuleLabel(rule, index);
        const ruleId = `recursive-rule-${index}`;
        const delimiterValue = formatDelimiters(
          rule.delimiters ?? defaultRuleDelimiters,
        );
        const includeValue = rule.includeDelim ?? "none";
        const modeValue = rule.whitespace
          ? "whitespace"
          : rule.delimiters && rule.delimiters.length > 0
            ? "delimiter"
            : "fallback";

        return (
          <FieldGroup
            key={ruleId}
            className="grid grid-cols-1 border border-border bg-muted/30 p-3 md:grid-cols-2"
          >
            <Field>
              <FieldLabel htmlFor={`${ruleId}-mode`}>Rule mode</FieldLabel>
              <ToggleGroup value={[modeValue]} id={`${ruleId}-mode`}>
                {(["delimiter", "whitespace", "fallback"] as const).map(
                  (option) => (
                    <ToggleGroupItem
                      key={option}
                      variant="outline"
                      className="flex-1 overflow-clip"
                      value={option}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          rules: ensureNonEmptyRules(
                            prev.rules.map((item, itemIndex) => {
                              if (itemIndex !== index) return item;
                              if (option === "whitespace") {
                                return toWhitespaceRule(item);
                              }
                              if (option === "delimiter") {
                                return toDelimiterRule(item);
                              }
                              return {};
                            }),
                            prev.rules,
                          ),
                        }))
                      }
                    >
                      {option}
                    </ToggleGroupItem>
                  ),
                )}
              </ToggleGroup>
              <div className="text-xs text-muted-foreground">{ruleLabel}</div>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ruleId}-include`}>
                Include delimiter
              </FieldLabel>
              <ToggleGroup value={[includeValue]} id={`${ruleId}-include`}>
                {(["prev", "next", "none"] as const).map((option) => (
                  <ToggleGroupItem
                    key={option}
                    variant="outline"
                    className="flex-1"
                    value={option}
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        rules: ensureNonEmptyRules(
                          prev.rules.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  includeDelim:
                                    option === "none" ? null : option,
                                }
                              : item,
                          ),
                          prev.rules,
                        ),
                      }))
                    }
                  >
                    {option}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            {modeValue === "delimiter" && (
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={`${ruleId}-delimiters`}>
                  Delimiters
                </FieldLabel>
                <Input
                  id={`${ruleId}-delimiters`}
                  value={delimiterValue}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      rules: ensureNonEmptyRules(
                        prev.rules.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                delimiters: parseRuleDelimiters(
                                  event.target.value,
                                  defaultRuleDelimiters,
                                ),
                              }
                            : item,
                        ),
                        prev.rules,
                      ),
                    }))
                  }
                />
              </Field>
            )}
          </FieldGroup>
        );
      })}
    </FieldGroup>
  );
};
