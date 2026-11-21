import "./lib/production.server";
import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { NonceContext } from "./lib/nonce";
import { initMonitoring, reportError } from "./lib/monitoring.server";

initMonitoring("studio");
import { assertEnv, env } from "./lib/env.server";

// Fail fast on a misconfigured deployment (e.g. dev sign-in enabled in production).
assertEnv();

export const streamTimeout = 5_000;

/**
 * Strict script CSP for Studio. Inline styles are allowed because the editor (ProseMirror)
 * sets style attributes itself; scripts still need this request's nonce.
 * form-action allows the Supabase/Google sign-in redirects. Production only.
 */
function contentSecurityPolicy(nonce: string, https: boolean): string {
  const authOrigins = [env.supabaseUrl ? new URL(env.supabaseUrl).origin : "", "https://accounts.google.com"].filter(Boolean);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `form-action 'self' ${authOrigins.join(" ")}`,
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}


/** Response headers for every Studio HTML document. */
function applyDocumentHeaders(headers: Headers, status: number, nonce: string, request: Request) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (process.env["NODE_ENV"] === "production") {
    const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, https));
  }
  // Studio is private: never cached anywhere, never indexed, never framed.
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  void status;
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  const nonce = randomBytes(16).toString("base64");
  if (request.method.toUpperCase() === "HEAD") {
    applyDocumentHeaders(responseHeaders, responseStatusCode, nonce, request);
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");
    // Crawlers get the fully rendered page in one response.
    const readyOption =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <NonceContext.Provider value={nonce}>
        <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
      </NonceContext.Provider>,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          applyDocumentHeaders(responseHeaders, responseStatusCode, nonce, request);
          pipe(body);
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );
  });
}

/** Unexpected loader/action/render errors (not aborted requests) are reported. */
export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) return;
  reportError(error, { url: new URL(request.url).pathname, method: request.method });
}
