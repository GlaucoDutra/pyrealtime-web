import { describe, expect, it } from "vitest";
import { classifyAttachment, extensionOf, splitText } from "./file-processing";

describe("file processing", () => {
  it("classifies the plugin-compatible file families", () => {
    expect(classifyAttachment("photo.PNG")).toBe("image");
    expect(classifyAttachment("report.pdf")).toBe("pdf");
    expect(classifyAttachment("table.xlsx")).toBe("spreadsheet");
    expect(classifyAttachment("notes.md")).toBe("text");
    expect(classifyAttachment("slides.pptx")).toBe("preprocess");
    expect(classifyAttachment("archive.zip")).toBe("unsupported");
  });

  it("extracts extensions without query or fragment suffixes", () => {
    expect(extensionOf("report.CSV?download=1")).toBe("csv");
  });

  it("chunks and reports truncation", () => {
    expect(splitText("abcdefghij", 8, 3)).toEqual({ chunks: ["abc", "def", "gh"], truncated: true });
  });
});
