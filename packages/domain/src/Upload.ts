import { Schema } from "effect";

// ============================================================================
// Accepted document types
// ============================================================================

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md", ".csv"] as const;

// ============================================================================
// Upload configuration
// ============================================================================

export const CHUNK_SIZE = 512 * 1024; // 512 KB
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ============================================================================
// Upload state per file
// ============================================================================

export const FileUploadStatus = Schema.Literals([
  "pending",
  "reading",
  "uploading",
  "complete",
  "error",
]);

export type FileUploadStatus = Schema.Schema.Type<typeof FileUploadStatus>;

export const FileUploadEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  size: Schema.Number,
  type: Schema.String,
  status: FileUploadStatus,
  progress: Schema.Number,
  error: Schema.optional(Schema.String),
  ingesting: Schema.optional(Schema.Boolean),
  chunksTotal: Schema.Number,
  chunksUploaded: Schema.Number,
});

export type FileUploadEntry = Schema.Schema.Type<typeof FileUploadEntry>;

// ============================================================================
// Upload request chunk (wire format for future server integration)
// ============================================================================

export const UploadChunk = Schema.Struct({
  fileId: Schema.String,
  fileName: Schema.String,
  chunkIndex: Schema.Number,
  totalChunks: Schema.Number,
  data: Schema.String, // base64-encoded chunk
});

export type UploadChunk = Schema.Schema.Type<typeof UploadChunk>;

// ==========================================================================
// Upload ingest progress events
// ==========================================================================

export const UploadIngestEvent = Schema.Union([
  Schema.TaggedStruct("chunk-received", {
    id: Schema.String,
    chunkIndex: Schema.Number,
  }),
  Schema.TaggedStruct("ingest-start", {
    id: Schema.String,
  }),
  Schema.TaggedStruct("ingest-progress", {
    id: Schema.String,
    processed: Schema.Number,
    total: Schema.Number,
  }),
  Schema.TaggedStruct("ingest-complete", {
    id: Schema.String,
    total: Schema.Number,
  }),
  Schema.TaggedStruct("ingest-failed", {
    id: Schema.String,
    message: Schema.String,
  }),
]);

export type UploadIngestEvent = Schema.Schema.Type<typeof UploadIngestEvent>;
