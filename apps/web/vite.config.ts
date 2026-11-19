import { reactRouter } from "@react-router/dev/vite";
import netlifyReactRouter from "@netlify/vite-plugin-react-router";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Netlify's adapter (SSR as a serverless function) only for Netlify builds; local and test
// builds keep using react-router-serve.
const forNetlify = process.env["NETLIFY"] === "true" || process.env["DEPLOY_TARGET"] === "netlify";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), ...(forNetlify ? [netlifyReactRouter()] : [])],
  // See app/lib/production.server.ts.
  define: {
    __COINGIST_FORCE_PRODUCTION__: forNetlify ? "true" : "false",
    // See app/lib/image.ts.
    __COINGIST_IMAGE_CDN__: forNetlify ? "true" : "false",
  },
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
});
