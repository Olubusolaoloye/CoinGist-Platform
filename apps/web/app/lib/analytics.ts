type Plausible = (event: string, options?: { props?: Record<string, string> }) => void;

/** Send a custom event to Plausible if analytics is enabled; otherwise do nothing. */
export function track(event: "Newsletter Signup" | "Share" | "Ad Click" | "Story Like" | "Comment", props?: Record<string, string>) {
  if (typeof window === "undefined") return;
  const plausible = (window as unknown as { plausible?: Plausible }).plausible;
  try {
    plausible?.(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the page.
  }
}
