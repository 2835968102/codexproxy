import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/desktop",
  build: {
    outDir: "../../dist/desktop",
    emptyOutDir: true
  },
  server: {
    port: 5174
  }
});
