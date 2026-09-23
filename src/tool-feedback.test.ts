import { describe, expect, it } from "vitest";
import { toolFeedback } from "./tool-feedback";

describe("toolFeedback", () => {
  it("shows useful phases for web search", () => {
    expect(toolFeedback("web_search", "starting")).toBe("Searching the web…");
    expect(toolFeedback("web_search", "working")).toBe("Reading and comparing sources…");
    expect(toolFeedback("web_search", "complete")).toBe("Web search complete.");
  });

  it("distinguishes a timeout from a generic failure", () => {
    expect(toolFeedback("web_search", "error", "Hosted tool request timed out"))
      .toContain("timed out; please try again");
  });
});
