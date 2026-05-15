import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
