import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // Behind a preview proxy the Host header isn't localhost. Only opened up when extra action
  // origins are explicitly allowed (dev server only; production doesn't run Vite).
  server: process.env["STUDIO_ALLOWED_ACTION_ORIGINS"] ? { allowedHosts: true } : {},
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  // Pre-bundle up front so the dev server doesn't reload the page on first visit.
  optimizeDeps: {
    include: [
      "@tiptap/react",
      "@tiptap/core",
      "@tiptap/starter-kit",
      "@tiptap/extension-image",
      "@tiptap/extensions",
      "zod",
    ],
  },
});
