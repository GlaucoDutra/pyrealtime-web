import { describe, expect, it } from "vitest";
import { classifyAttachment, extensionOf } from "./file-processing";

describe("file processing", () => {
  it("classifies the plugin-compatible file families", () => {
    expect(classifyAttachment("photo.PNG")).toBe("image");
    expect(classifyAttachment("report.pdf")).toBe("document");
    expect(classifyAttachment("table.xlsx")).toBe("document");
    expect(classifyAttachment("notes.md")).toBe("text");
    expect(classifyAttachment("slides.pptx")).toBe("document");
    expect(classifyAttachment("archive.zip")).toBe("unsupported");
  });

  it("extracts extensions without query or fragment suffixes", () => {
    expect(extensionOf("report.CSV?download=1")).toBe("csv");
  });
});
