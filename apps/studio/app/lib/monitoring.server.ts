import * as Sentry from "@sentry/node";

let enabled = false;

/**
 * Error reporting to Sentry, only when SENTRY_DSN is set. No personal data: cookies,
 * authorization headers and request bodies are stripped before anything leaves the server.
 */
export function initMonitoring(service: string) {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn || enabled) return;
  Sentry.init({
    dsn,
    environment: process.env["SENTRY_ENVIRONMENT"] ?? process.env["NODE_ENV"] ?? "development",
    release: process.env["SENTRY_RELEASE"],
    // Collect no personal data: no user info, cookies, bodies, query strings or AI text.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: ["authorization", "cookie", "x-api-key"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
    initialScope: { tags: { service } },
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          for (const h of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie|x-api-key)$/i.test(h)) delete event.request.headers[h];
          }
        }
      }
      return event;
    },
  });
  enabled = true;
}

/** Log an unexpected error and, when Sentry is configured, report it. */
export function reportError(error: unknown, context: Record<string, string | number | undefined> = {}) {
  console.error(error);
  if (enabled) Sentry.captureException(error, { extra: context });
}
