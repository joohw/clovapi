import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "keep-embed-directory",
    closeBundle() {
      const dir = path.resolve(__dirname, "../core/internal/webui/dist");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".gitkeep"), "");
    },
  }],
  root: __dirname,
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  base: "/",
  build: {
    outDir: path.resolve(__dirname, "../core/internal/webui/dist"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 31873,
    strictPort: true,
    proxy: {
      "/api/admin": "http://127.0.0.1:27484",
    },
  },
});
