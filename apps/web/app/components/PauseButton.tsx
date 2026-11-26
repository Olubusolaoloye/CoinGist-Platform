import { pauseIcon } from "~/lib/motion";

/** Pause/play for content that moves on its own (WCAG 2.2.2). */
export function PauseButton({ paused, onClick, what, className = "" }: { paused: boolean; onClick: () => void; what: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={paused}
      aria-label={paused ? `Play ${what}` : `Pause ${what}`}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink hover:border-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
        <path d={pauseIcon(paused)} />
      </svg>
    </button>
  );
}
