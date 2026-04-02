import { useAtom } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useMemo, useState } from "react";
import { type ChunkerKind, chunkerAtom } from "@/lib/atoms/chunker-atom";
import { cn } from "@/lib/utils";
import { useFastChunkerConfig } from "./chunker/useFastChunkerConfig";
import { useRecursiveChunkerConfig } from "./chunker/useRecursiveChunkerConfig";
import { useSentenceChunkerConfig } from "./chunker/useSentenceChunkerConfig";
import { useTableChunkerConfig } from "./chunker/useTableChunkerConfig";
import { useTokenChunkerConfig } from "./chunker/useTokenChunkerConfig";
import { ChunkerOptions } from "./chunker-options";
import { Button } from "./ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const DEFAULT_TEXT =
  "RAG systems rely on chunking to keep retrieval focused. When documents are too large, a query matches broad sections and the model wastes context. When chunks are too small, answers lose continuity and important details are split across boundaries. A good chunking strategy balances semantic cohesion with a predictable size so the retriever can rank content effectively.\n\n" +
  "Think about what your users search for. If they ask about product capabilities, chunk by headings and feature lists. If they ask about procedures, keep steps and prerequisites together. If they ask about troubleshooting, preserve error messages with their recommended fixes. The right delimiters and overlap help keep these relationships intact while still letting you control token budgets.\n\n" +
  "This playground lets you test different chunk sizes, overlaps, and delimiter rules. Try a smaller size with a little overlap and see how the boundaries shift. Then increase the size to keep more context together. You will notice how the chunk count changes and how much text repeats when overlap is enabled.";

const INPUT_PRESETS = {
  txt: DEFAULT_TEXT,
  md:
    "# Campus survey insights\n\n" +
    "We interviewed 18 students about study habits and class tools. The notes below summarize what they use most and where friction shows up.\n\n" +
    "| Tool | Use case | Friction |\n" +
    "| --- | --- | --- |\n" +
    "| Course portal | Assignments, grades | Slow navigation |\n" +
    "| Docs | Group outlines | Version confusion |\n" +
    "| Calendar | Deadlines | Notification overload |\n\n" +
    "Recommendations:\n" +
    "- Keep core resources in one place.\n" +
    "- Offer a single weekly summary.\n" +
    "- Make ownership clear for group work.\n",
  html:
    "<h1>Experiment summary</h1>\n" +
    "<p>We tested three onboarding flows with 42 new users to compare completion rates and time to value.</p>\n" +
    "<table>\n" +
    "  <thead>\n" +
    "    <tr><th>Flow</th><th>Completion</th><th>Median time</th></tr>\n" +
    "  </thead>\n" +
    "  <tbody>\n" +
    "    <tr><td>A</td><td>78%</td><td>3m 12s</td></tr>\n" +
    "    <tr><td>B</td><td>84%</td><td>2m 41s</td></tr>\n" +
    "    <tr><td>C</td><td>69%</td><td>4m 05s</td></tr>\n" +
    "  </tbody>\n" +
    "</table>\n" +
    "<p>Flow B performed best but users requested clearer next steps after the first task.</p>\n",
} as const;

type InputPreset = keyof typeof INPUT_PRESETS;

const CHUNKER_LABELS: Record<ChunkerKind, string> = {
  fast: "Fast chunker",
  sentence: "Sentence chunker",
  recursive: "Recursive chunker",
  token: "Token chunker",
  table: "Table chunker",
};

const highlightPalette = [
  "bg-emerald-500/20 text-foreground",
  "bg-amber-400/25 text-foreground",
  "bg-sky-500/20 text-foreground",
  "bg-lime-500/20 text-foreground",
  "bg-fuchsia-500/20 text-foreground",
] as const;

export const clampChunkOverlap = (chunkSize: number, overlap: number) =>
  Math.max(0, Math.min(overlap, Math.max(0, chunkSize - 1)));

export function ChunkerVisualizer() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [inputPreset, setInputPreset] = useState<InputPreset>("txt");
  const [chunker, setChunker] = useState<ChunkerKind>("sentence");
  const fastChunker = useFastChunkerConfig();
  const sentenceChunker = useSentenceChunkerConfig();
  const recursiveChunker = useRecursiveChunkerConfig();
  const tokenChunker = useTokenChunkerConfig();
  const tableChunker = useTableChunkerConfig();

  const chunkerRequest = useMemo(() => {
    switch (chunker) {
      case "fast":
        return fastChunker.buildRequest(text);
      case "sentence":
        return sentenceChunker.buildRequest(text);
      case "recursive":
        return recursiveChunker.buildRequest(text);
      case "token":
        return tokenChunker.buildRequest(text);
      case "table":
        return tableChunker.buildRequest(text);
      default:
        return tableChunker.buildRequest(text);
    }
  }, [
    text,
    chunker,
    fastChunker,
    sentenceChunker,
    recursiveChunker,
    tokenChunker,
    tableChunker,
  ]);

  const [result, runChunker] = useAtom(chunkerAtom);

  const output = AsyncResult.getOrElse(result, () => []);

  const handleRun = () => {
    runChunker(chunkerRequest);
  };

  const handleCopy = async () => {
    if (output.length === 0) return;
    const raw = output
      .map(
        (chunk, index) => `Chunk ${index + 1}\n${"-".repeat(8)}\n${chunk.text}`,
      )
      .join("\n\n");
    await navigator.clipboard.writeText(raw);
  };

  const handlePresetChange = (preset: InputPreset) => {
    setInputPreset(preset);
    setText(INPUT_PRESETS[preset]);
  };

  return (
    <Card className="h-full w-full col-span-2">
      <CardHeader className="border-b border-border">
        <CardTitle>Chunker Playground</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              Copy chunks
            </Button>
            <Button size="sm" onClick={handleRun}>
              Chunk text
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 h-full overflow-hidden">
        <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <Field>
              <FieldLabel htmlFor="chunker-input-text">Input text</FieldLabel>
              <ToggleGroup
                id="input-text-format"
                value={[inputPreset]}
                className="w-full"
              >
                {(["txt", "md", "html"] as const).map((preset) => (
                  <ToggleGroupItem
                    key={preset}
                    value={preset}
                    variant="outline"
                    className="flex-1"
                    onClick={() => handlePresetChange(preset)}
                  >
                    {preset}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Textarea
                id="chunker-input-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={12}
                className="min-h-16"
              />
            </Field>

            <div className="space-y-2 rounded-none border border-border bg-muted/40 p-3 overflow-scroll">
              <Field>
                <FieldLabel htmlFor="chunker-select">Chunker</FieldLabel>
                <Select
                  id="chunker-select"
                  value={chunker}
                  onValueChange={(value) => setChunker(value as ChunkerKind)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chunker" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHUNKER_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <ChunkerOptions
                type={chunker}
                fastConfig={fastChunker.config}
                setFastConfig={fastChunker.setConfig}
                sentenceConfig={sentenceChunker.config}
                setSentenceConfig={sentenceChunker.setConfig}
                recursiveConfig={recursiveChunker.config}
                setRecursiveConfig={recursiveChunker.setConfig}
                tokenConfig={tokenChunker.config}
                setTokenConfig={tokenChunker.setConfig}
                tableConfig={tableChunker.config}
                setTableConfig={tableChunker.setConfig}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
              <span>Chunked output</span>
              <span>{output.length} chunks</span>
            </div>
            <div className="flex-1 h-full overflow-y-auto rounded-none border border-border bg-muted/20 p-3 text-xs leading-relaxed">
              {output.length === 0 ? (
                <div className="text-muted-foreground">
                  Run the chunker to see highlighted output.
                </div>
              ) : (
                <div className="whitespace-pre-wrap">
                  {output.map((chunk, index) => (
                    <Tooltip key={chunk.startIdx}>
                      <TooltipTrigger
                        render={(props) => (
                          <span
                            className={cn(
                              "rounded-sm px-0.5",
                              highlightPalette[
                                chunk.startIdx % highlightPalette.length
                              ],
                            )}
                            {...props}
                          >
                            {chunk.text}
                          </span>
                        )}
                      />
                      <TooltipContent side="left">
                        <div className="flex flex-col gap-1">
                          <div>
                            <strong>Chunk {index + 1}</strong>
                          </div>
                          <div>
                            Tokens: {chunk.tokenCount} | Characters:{" "}
                            {chunk.text.length}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
