import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;
export const TEXT_CHUNK_SIZE = 8_000;
export const MAX_DATA_CHANNEL_BYTES = 200_000;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "js", "ts", "html", "css", "xml"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const EXCEL_EXTENSIONS = new Set(["xlsx", "xlsm"]);
const PREPROCESS_EXTENSIONS = new Set(["xls", "xlsb", "ods", "doc", "docx", "ppt", "pptx"]);

export type AttachmentKind = "image" | "text" | "pdf" | "spreadsheet" | "preprocess" | "unsupported";

export interface ExtractedAttachment {
  kind: "text" | "preprocess" | "unsupported";
  fileName: string;
  extension: string;
  text: string;
}

export interface ImageAttachment {
  kind: "image";
  fileName: string;
  dataUrl: string;
}

export type PreparedAttachment = ExtractedAttachment | ImageAttachment;

export function extensionOf(fileName: string): string {
  const clean = fileName.split(/[?#]/, 1)[0] ?? "";
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export function classifyAttachment(fileName: string): AttachmentKind {
  const extension = extensionOf(fileName);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (PDF_EXTENSIONS.has(extension)) return "pdf";
  if (EXCEL_EXTENSIONS.has(extension)) return "spreadsheet";
  if (PREPROCESS_EXTENSIONS.has(extension)) return "preprocess";
  return "unsupported";
}

export function splitText(value: string, maximum = MAX_TEXT_CHARS, chunkSize = TEXT_CHUNK_SIZE): {
  chunks: string[];
  truncated: boolean;
} {
  const clipped = value.slice(0, maximum);
  const chunks: string[] = [];
  for (let offset = 0; offset < clipped.length; offset += chunkSize) {
    chunks.push(clipped.slice(offset, offset + chunkSize));
  }
  return { chunks: chunks.length ? chunks : ["[empty file]"], truncated: value.length > maximum };
}

function validateFile(file: File): void {
  if (!file.name.trim()) throw new Error("The selected file has no name.");
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Files larger than 25 MB are not supported.");
}

async function extractPdf(file: File, onProgress?: (message: string) => void): Promise<string> {
  onProgress?.("Reading PDF…");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(`Reading PDF page ${pageNumber} of ${document.numPages}…`);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(`[PAGE ${pageNumber}]\n${text || "[no selectable text found on this page]"}`);
  }
  return pages.join("\n\n");
}

async function extractSpreadsheet(file: File, onProgress?: (message: string) => void): Promise<string> {
  onProgress?.("Reading spreadsheet…");
  const { default: readXlsxFile } = await import("read-excel-file");
  const rows = await readXlsxFile(file);
  const lines = rows
    .map((row) => row.map((cell) => String(cell ?? "").replace(/[\t\r\n]+/g, " ").trim()).join("\t").trimEnd())
    .filter(Boolean);
  return `[SHEET 1]\n${lines.length ? lines.join("\n") : "[empty sheet]"}`;
}

function canvasDataUrl(image: ImageBitmap, width: number, quality: number): string {
  const scale = Math.min(1, width / Math.max(image.width, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not prepare the image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function compressImage(file: File, onProgress?: (message: string) => void): Promise<string> {
  onProgress?.("Compressing image…");
  const image = await createImageBitmap(file);
  try {
    let width = 1_024;
    let quality = 0.72;
    let dataUrl = canvasDataUrl(image, width, quality);
    for (let attempt = 0; attempt < 6 && new TextEncoder().encode(dataUrl).length > 145_000; attempt += 1) {
      width = Math.max(320, Math.round(width * 0.78));
      quality = Math.max(0.42, quality - 0.07);
      dataUrl = canvasDataUrl(image, width, quality);
    }
    if (new TextEncoder().encode(dataUrl).length > 160_000) {
      throw new Error("The compressed image is still too large for the Realtime data channel.");
    }
    return dataUrl;
  } finally {
    image.close();
  }
}

export async function prepareAttachment(file: File, onProgress?: (message: string) => void): Promise<PreparedAttachment> {
  validateFile(file);
  const extension = extensionOf(file.name);
  const kind = classifyAttachment(file.name);
  if (kind === "image") {
    return { kind, fileName: file.name, dataUrl: await compressImage(file, onProgress) };
  }
  if (kind === "text") {
    onProgress?.("Reading text file…");
    return { kind, fileName: file.name, extension, text: await file.text() };
  }
  if (kind === "pdf") {
    const text = await extractPdf(file, onProgress);
    if (!text.trim()) throw new Error("No selectable PDF text was found. A scanned PDF requires OCR first.");
    return { kind: "text", fileName: file.name, extension, text };
  }
  if (kind === "spreadsheet") {
    return { kind: "text", fileName: file.name, extension, text: await extractSpreadsheet(file, onProgress) };
  }
  if (kind === "preprocess") {
    return {
      kind,
      fileName: file.name,
      extension,
      text: "This Word or PowerPoint file needs text extraction before a Realtime session can analyze its contents.",
    };
  }
  return {
    kind,
    fileName: file.name,
    extension,
    text: "This file type needs preprocessing or text extraction before a Realtime session can analyze it.",
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}
