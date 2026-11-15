/** Server-only Studio configuration. */
export type AuthMode = "supabase" | "dev";

const isProd = process.env["NODE_ENV"] === "production";

export const env = {
  apiUrl: (process.env["API_URL"] ?? "http://localhost:8787").replace(/\/$/, ""),
  studioUrl: (process.env["STUDIO_URL"] ?? "http://localhost:5174").replace(/\/$/, ""),
  siteUrl: (process.env["SITE_URL"] ?? "http://localhost:5173").replace(/\/$/, ""),
  supabaseUrl: process.env["SUPABASE_URL"] ?? "",
  supabaseAnonKey: process.env["SUPABASE_ANON_KEY"] ?? "",
  sessionSecret: process.env["SESSION_SECRET"] ?? "",
  authMode: (process.env["STUDIO_AUTH"] ?? (isProd ? "supabase" : "dev")) as AuthMode,
  isProd,
};

export function assertEnv() {
  if (env.authMode === "dev" && isProd) {
    throw new Error("STUDIO_AUTH=dev is not allowed in production");
  }
  if (env.authMode === "supabase" && (!env.supabaseUrl || !env.supabaseAnonKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required when STUDIO_AUTH=supabase");
  }
  if (isProd && env.sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET (32+ characters) is required in production");
  }
}
