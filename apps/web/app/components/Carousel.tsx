import { Children, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "prev" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

export function CarouselButton({ dir, onClick, disabled, label, controls }: { dir: "prev" | "next"; onClick: () => void; disabled: boolean; label: string; controls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-controls={controls}
      aria-label={label}
      className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm hover:border-ink disabled:opacity-35"
    >
      <Arrow dir={dir} />
    </button>
  );
}

/**
 * Accessible, swipeable carousel. Native scroll-snap does the moving (touch, trackpad and
 * keyboard all work without JavaScript); the buttons page through it. No autoplay.
 */
export function Carousel({
  label,
  heading,
  action,
  children,
  itemClassName,
  showDots = false,
  className = "",
}: {
  /** Accessible name, e.g. "Latest news". */
  label: string;
  /** Visible heading row (left side). */
  heading?: ReactNode;
  /** Extra control in the heading row, e.g. a "See all" link. */
  action?: ReactNode;
  children: ReactNode;
  /** Width of each slide, e.g. "w-[78%] sm:w-[45%] lg:w-[31%]". */
  itemClassName: string;
  showDots?: boolean;
  className?: string;
}) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);
  const items = Children.toArray(children);
  const [edges, setEdges] = useState({ start: true, end: items.length <= 1 });
  const [active, setActive] = useState(0);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
    const first = el.children[0] as HTMLElement | undefined;
    if (first) setActive(Math.round(el.scrollLeft / (first.offsetWidth + 16)));
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  const goTo = (i: number) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (el && slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return (
    <section aria-roledescription="carousel" aria-label={label} className={`min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {items.length > 1 ? (
            <>
              <CarouselButton dir="prev" label={`Previous ${label.toLowerCase()}`} onClick={() => page(-1)} disabled={edges.start} controls={id} />
              <CarouselButton dir="next" label={`Next ${label.toLowerCase()}`} onClick={() => page(1)} disabled={edges.end} controls={id} />
            </>
          ) : null}
        </div>
      </div>
      <ul id={id} ref={track} className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {items.map((child, i) => (
          <li key={i} className={`shrink-0 snap-start ${itemClassName}`}>
            <div role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`} className="h-full">
              {child}
            </div>
          </li>
        ))}
      </ul>
      {showDots && items.length > 1 ? (
        <div className="mt-3 flex justify-center gap-2" role="group" aria-label={`Choose a slide in ${label.toLowerCase()}`}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              aria-controls={id}
              onClick={() => goTo(i)}
              className={`h-2.5 rounded-full transition-all ${i === active ? "w-7 bg-ink" : "w-2.5 bg-line hover:bg-muted"}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
