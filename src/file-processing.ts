/** Browser-only attachment UX helpers. File interpretation belongs to PyRealtime. */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_DATA_CHANNEL_BYTES = 200_000;

export type AttachmentKind = "image" | "text" | "document" | "unsupported";

export interface PreparedAttachment {
  kind: "text" | "image" | "notice";
  filename: string;
  media_type: string;
  size_bytes: number;
  chunks?: string[];
  truncated?: boolean;
  data_url?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "jsonl", "js", "jsx", "ts", "tsx", "html", "css", "xml",
  "yaml", "yml", "toml", "py", "java", "c", "cpp", "h", "hpp", "sql", "sh", "ps1", "log",
]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "xlsx", "xlsm", "docx", "pptx"]);

export function extensionOf(fileName: string): string {
  const clean = fileName.split(/[?#]/, 1)[0] ?? "";
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export function classifyAttachment(fileName: string): AttachmentKind {
  const extension = extensionOf(fileName);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return "unsupported";
}

export function validateAttachmentSelection(file: File): void {
  if (!file.name.trim()) throw new Error("The selected file has no name.");
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Files larger than 25 MB are not supported.");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}
