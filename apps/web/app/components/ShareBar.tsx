import { useState } from "react";
import { track } from "~/lib/analytics";

export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { name: "X", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
  ];
  const btn =
    "inline-flex min-h-11 items-center rounded-md border border-line px-3.5 text-sm font-medium hover:border-ink";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
      track("Share", { network: "Copy link" });
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div>
      <h2 className="font-display text-base font-bold">Share this story</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" className={btn} onClick={() => track("Share", { network: l.name })}>
            {l.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ))}
        <button type="button" onClick={copy} className={btn}>
          Copy link
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-muted">
        {copied === "done" ? "Link copied." : copied === "failed" ? "Couldn't copy. Copy the address bar instead." : ""}
      </p>
    </div>
  );
}
