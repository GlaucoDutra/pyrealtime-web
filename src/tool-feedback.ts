export type ToolActivityPhase = "starting" | "working" | "delayed" | "complete" | "error";

const LABELS: Record<string, Partial<Record<ToolActivityPhase, string>>> = {
  web_search: {
    starting: "Searching the web…",
    working: "Reading and comparing sources…",
    delayed: "Still searching — some pages take longer to read…",
    complete: "Web search complete.",
    error: "Web search could not be completed.",
  },
  file_search: {
    starting: "Searching your files…",
    working: "Reading the most relevant matches…",
    delayed: "Still searching your files…",
    complete: "File search complete.",
    error: "File search could not be completed.",
  },
  generate_image: {
    starting: "Generating the image…",
    working: "Rendering the image…",
    delayed: "Still rendering — image generation can take a moment…",
    complete: "Image generated.",
    error: "Image generation could not be completed.",
  },
};

function readableName(name: string): string {
  return name.replaceAll("_", " ");
}

export function toolFeedback(name: string, phase: ToolActivityPhase, error = ""): string {
  if (phase === "error" && /timed out|timeout/i.test(error)) {
    return `${LABELS[name]?.error ?? `${readableName(name)} could not be completed.`} The request timed out; please try again.`;
  }
  return LABELS[name]?.[phase] ?? {
    starting: `Running ${readableName(name)}…`,
    working: `Waiting for ${readableName(name)}…`,
    delayed: `Still working on ${readableName(name)}…`,
    complete: `${readableName(name)} complete.`,
    error: `${readableName(name)} could not be completed.`,
  }[phase];
}
