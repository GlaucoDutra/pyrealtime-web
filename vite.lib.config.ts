import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/client/index.ts"),
      name: "PyRealtimeClient",
      formats: ["es", "cjs"],
      fileName: (format) => format === "es" ? "index.js" : "index.cjs",
    },
    outDir: "dist-client",
    emptyOutDir: true,
    sourcemap: true,
  },
});
