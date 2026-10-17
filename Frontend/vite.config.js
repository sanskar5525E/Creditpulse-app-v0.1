import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

export default defineConfig({
  // Required for GitHub Pages: https://sanskar5525E.github.io/Creditpulse-app-v0.1/
  base: "/Creditpulse-app-v0.1/",
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html")
      }
    }
  }
});
