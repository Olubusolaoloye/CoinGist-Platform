import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { env } from "./env.server";

/**
 * Supabase client bound to one request. Session cookies it refreshes are collected in
 * `headers` and must be returned on the response (see lib/headers.ts).
 */
export function supabaseForRequest(request: Request) {
  const headers = new Headers();
  const client = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
        }
      },
    },
    cookieOptions: { sameSite: "lax", secure: env.isProd, httpOnly: true, path: "/" },
  });
  return { client, headers };
}
