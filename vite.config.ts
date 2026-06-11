import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ["**/.codex-run/**", "**/.playwright-mcp/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:6000",
    },
  },
});
