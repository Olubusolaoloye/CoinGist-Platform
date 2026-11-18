import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { analyticsConfig } from "./lib/config.server";
import { assertReaderAuthConfig, readerAuthMode } from "./lib/reader.server";

// Fail fast on a misconfigured deployment (e.g. dev reader sign-in in production).
assertReaderAuthConfig();
import { NonceContext } from "./lib/nonce";

export const streamTimeout = 5_000;

/**
 * Strict CSP: scripts and inline styles only from this origin or with this request's nonce.
 * Production only (Vite's dev server injects inline scripts).
 */
function contentSecurityPolicy(nonce: string, https: boolean): string {
  // Plausible, when configured, loads its script from and reports to its own origin.
  const analytics = analyticsConfig()?.origin ?? "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${analytics}`.trim(),
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${analytics}`.trim(),
    "media-src 'self' https:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    // Reader sign-in with Google redirects through Supabase after a form post.
    `form-action 'self' ${readerAuthMode() === "supabase" && process.env["SUPABASE_URL"] ? `${new URL(process.env["SUPABASE_URL"]).origin} https://accounts.google.com` : ""}`.trim(),
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}


/** Site-wide response headers for every HTML document. */
function applyDocumentHeaders(headers: Headers, status: number, nonce: string, request: Request) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (process.env["NODE_ENV"] === "production") {
    const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, https));
  }
  // Never let a CDN cache an error page (a transient 404/502 would stick for every reader).
  if (status >= 400) headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  // Preview deploys carry fake stories: keep them out of search engines.
  if (process.env["DEMO_MODE"] === "true") headers.set("X-Robots-Tag", "noindex, nofollow");
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
