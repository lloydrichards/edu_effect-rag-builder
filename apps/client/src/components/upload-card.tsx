import { useAtom } from "@effect/atom-react";
import type { FileUploadEntry } from "@repo/domain/Upload";
import { ACCEPTED_EXTENSIONS } from "@repo/domain/Upload";
import { AsyncResult } from "effect/unstable/reactivity";
import { CheckCircle2, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { uploadAtom, validateFiles } from "@/lib/atoms/upload-atom";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

export function UploadCard() {
  const [result, runUpload] = useAtom(uploadAtom);
  const [dragOver, setDragOver] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadState = AsyncResult.getOrElse(result, () => ({
    files: [],
  }));

  const isUploading = uploadState.files.some(
    (f) => f.status === "uploading" || f.status === "reading",
  );

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const { valid, rejected } = validateFiles(fileList);
      setRejections(rejected);
      if (valid.length > 0) {
        runUpload(valid);
      }
    },
    [runUpload],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = "";
      }
    },
    [handleFiles],
  );

  const completedCount = uploadState.files.filter(
    (f) => f.status === "complete",
  ).length;
  const totalCount = uploadState.files.length;

  return (
    <Card className="h-full w-full">
      <CardHeader className="border-b border-border">
        <CardTitle>Document Upload</CardTitle>
        <CardAction>
          <div className="flex gap-2">
            {isUploading && (
              <Badge
                variant="outline"
                className="border-border bg-secondary text-[0.65rem] uppercase tracking-[0.2em] text-secondary-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading
              </Badge>
            )}
            {totalCount > 0 && !isUploading && (
              <Badge
                variant="outline"
                className="border-border bg-muted text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
              >
                {completedCount}/{totalCount}
              </Badge>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto px-4">
        <div className="space-y-4 py-4">
          {/* Drop zone */}
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer flex-col items-center gap-3 border border-dashed px-4 py-8 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              isUploading && "pointer-events-none opacity-50",
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <Upload className="h-6 w-6" />
            <div className="space-y-1">
              <p className="text-xs font-medium">
                Drop files here or click to browse
              </p>
              <p className="text-[0.65rem] text-muted-foreground">
                {ACCEPTED_EXTENSIONS.join(", ")} up to 100MB
              </p>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={onFileInputChange}
          />

          {/* Rejections */}
          {rejections.length > 0 && (
            <div className="space-y-1">
              {rejections.map((msg) => (
                <div
                  key={msg}
                  className="flex items-center gap-2 text-[0.65rem] text-destructive"
                >
                  <XCircle className="h-3 w-3 shrink-0" />
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* File list */}
          {uploadState.files.length > 0 && (
            <div className="space-y-1">
              {uploadState.files.map((entry) => (
                <FileRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {uploadState.files.length === 0 && rejections.length === 0 && (
            <div className="flex flex-col items-start gap-2 rounded-none border border-border bg-muted/50 px-4 py-6 text-xs text-muted-foreground">
              <p className="text-[0.65rem] uppercase tracking-[0.28em]">
                No documents
              </p>
              <p className="text-xs text-foreground">
                Upload documents to process them through the RAG pipeline.
              </p>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="border-t border-border">
        <div className="flex w-full items-center justify-between">
          <p className="text-[0.65rem] text-muted-foreground">
            Chunked upload ({(512).toString()}KB chunks)
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="h-3 w-3" />
            Add files
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function FileRow({ entry }: { entry: FileUploadEntry }) {
  const statusIcon = {
    pending: (
      <div className="h-3 w-3 rounded-full border border-muted-foreground" />
    ),
    reading: <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />,
    uploading: <Loader2 className="h-3 w-3 animate-spin text-primary" />,
    complete: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
    error: <XCircle className="h-3 w-3 text-destructive" />,
  }[entry.status];

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="flex items-center gap-3 border border-border px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{entry.name}</span>
          {entry.ingesting && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[0.55rem] font-medium text-muted-foreground">
              ingesting...
            </span>
          )}
          {entry.status === "error" &&
            entry.error?.toLowerCase().includes("ingest failed") && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.55rem] font-medium text-destructive">
                ingest failed
              </span>
            )}
          <span className="shrink-0 text-[0.6rem] text-muted-foreground">
            {formatSize(entry.size)}
          </span>
        </div>
        {(entry.status === "uploading" || entry.status === "reading") && (
          <div className="mt-1 h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${entry.progress}%` }}
            />
          </div>
        )}
        {entry.error && (
          <p className="mt-0.5 text-[0.6rem] text-destructive">{entry.error}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {(entry.status === "uploading" || entry.status === "reading") && (
          <span className="text-[0.6rem] text-muted-foreground">
            {entry.progress}%
          </span>
        )}
        {statusIcon}
      </div>
    </div>
  );
}
