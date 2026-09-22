import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" path alias from tsconfig.json so tests can import app code the same way.
export default defineConfig({
  // tsconfig keeps JSX as "preserve" for Next.js; tests need it compiled with the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
