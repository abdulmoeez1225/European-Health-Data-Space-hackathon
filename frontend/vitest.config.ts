import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    // One jsdom per worker instead of one per test file; each file still runs in its own context.
    pool: "vmThreads",
    // Form tests type whole requests with user-event; 5 s is too tight on slower machines.
    testTimeout: 20_000,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
