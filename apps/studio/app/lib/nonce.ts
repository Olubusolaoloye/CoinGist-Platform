import { createContext, useContext } from "react";

/** Per-request CSP nonce, provided by entry.server.tsx. */
export const NonceContext = createContext<string | undefined>(undefined);

/**
 * The nonce on the server; in the browser, the same value read back from a rendered script
 * (browsers hide the attribute but keep the `nonce` property), so hydration matches.
 */
export function useNonce(): string | undefined {
  const fromServer = useContext(NonceContext);
  if (fromServer) return fromServer;
  if (typeof document === "undefined") return undefined;
  return document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
}
