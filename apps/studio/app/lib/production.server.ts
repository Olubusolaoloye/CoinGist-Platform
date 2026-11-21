/**
 * Netlify doesn't set NODE_ENV for functions, so Netlify builds bake in a flag (vite.config.ts)
 * and production rules (no dev sign-in, secure cookies, required secrets) apply at runtime.
 * Imported first by every module that reads NODE_ENV.
 */
declare const __COINGIST_FORCE_PRODUCTION__: boolean | undefined;

if (typeof __COINGIST_FORCE_PRODUCTION__ !== "undefined" && __COINGIST_FORCE_PRODUCTION__) {
  process.env["NODE_ENV"] = "production";
}

export {};
