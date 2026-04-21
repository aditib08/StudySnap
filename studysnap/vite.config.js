import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Repo root (parent of `studysnap/`) — load the same `.env` as the root app */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  envDir: repoRoot,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
