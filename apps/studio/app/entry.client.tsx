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

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
