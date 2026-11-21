import { data, redirect } from "react-router";
import type { User } from "@coingist/types";
import type { AuthResult } from "./auth.server";
import { env } from "./env.server";

export interface Me {
  user: User;
  permissions: string[];
  mfaVerified: boolean;
  mfaRequired: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

/**
 * Typed client for the API, authenticated as the signed-in user.
 * Session problems become redirects; 403/404 become error pages; validation and conflict
 * errors are returned so forms can show them.
 */
export function studioApi(auth: AuthResult) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetch(`${env.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${auth.token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error(`API unreachable: ${method} ${path}`, err);
      throw data({ error: "The CoinGist API is not responding. Try again in a minute." }, { status: 503 });
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & T;
    if (res.ok) return { ok: true, data: json };

    const code = json.error?.code ?? "error";
    const message = json.error?.message ?? `Request failed (${res.status})`;
    if (res.status === 401) throw redirect("/login?expired=1", { headers: auth.headers });
    if (code === "mfa_required") throw redirect("/mfa", { headers: auth.headers });
    if (res.status === 403 && method === "GET") throw data({ error: message }, { status: 403 });
    if (res.status === 404 && method === "GET") throw data({ error: "Not found" }, { status: 404 });
    if (res.status >= 500) throw data({ error: "The API had a problem. Try again." }, { status: 502 });
    return { ok: false, status: res.status, code, message: friendlyMessage(code, message, json) };
  }

  /** GET that must succeed (errors already thrown above for 4xx/5xx). */
  async function get<T>(path: string): Promise<T> {
    const r = await request<T>("GET", path);
    if (!r.ok) throw data({ error: r.message }, { status: r.status });
    return r.data;
  }

  return {
    get,
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
    patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
    del: (path: string) => request<void>("DELETE", path),
    me: () => get<Me>("/v1/me"),
  };
}

function friendlyMessage(code: string, message: string, json: unknown): string {
  // zod-validator errors carry an issues array; surface the first one plainly.
  const issues = (json as { error?: { issues?: Array<{ path: string[]; message: string }> }; success?: boolean })
    ?.error?.issues;
  if (issues?.length) {
    const i = issues[0]!;
    return `${i.path.join(".") || "Input"}: ${i.message}`;
  }
  if (code === "conflict" && /slug/.test(message)) return "That URL slug is already used by another story.";
  if (code === "conflict" && /posts_slug_key|duplicate key/.test(message)) return "That URL slug is already used by another story.";
  if (code === "forbidden") return "You don't have permission to do that.";
  return message;
}
