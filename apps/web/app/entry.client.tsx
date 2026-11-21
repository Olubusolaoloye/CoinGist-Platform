import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Netlify inserts an HTML comment ("This site is hosted on Netlify…") at the top of <head>.
 * React expects <head> to contain exactly what the server rendered, so that comment made every
 * page fail hydration (React error #418): React threw the page away and rebuilt it in the
 * browser, and taps during the rebuild were lost ("links cut"). Before hydrating, remove what
 * Netlify adds directly inside <head>: comments, and the line breaks around them. React never
 * puts comments or text directly in <head>, so nothing of ours is touched.
 */
for (const node of Array.from(document.head.childNodes)) {
  const injected =
    node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim());
  if (injected) node.remove();
}

/**
 * Phones with 2 GB of memory or less tend to have weak graphics chips, where many live blurs
 * make scrolling stutter. They get the same colours without the blur (see .glass in app.css).
 * A data attribute, so React (which owns <html>'s class for the theme) leaves it alone.
 */
const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
if (typeof memory === "number" && memory <= 2) document.documentElement.dataset["liteGlass"] = "";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
