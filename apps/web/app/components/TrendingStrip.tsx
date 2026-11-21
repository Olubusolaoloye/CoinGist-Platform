import { useId, useRef } from "react";
import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { CarouselButton } from "./Carousel";
import { PauseButton } from "./PauseButton";
import { useAutoAdvance } from "~/lib/motion";

/**
 * The newest headlines in one line. It moves to the next headline every 4 seconds, looping back
 * to the start; it holds while the reader points at it or tabs into it, has a pause button, and
 * doesn't move for people who prefer reduced motion. Swipe or use the arrow any time.
 */
export function TrendingStrip({ posts }: { posts: PostSummary[] }) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);

  const next = () => {
    const el = track.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) {
      el.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    // The first headline starting to the right of the current view's left edge. (The list is
    // position: relative, so each headline's offsetLeft is measured from the list's own start.)
    const items = Array.from(el.children) as HTMLElement[];
    const target = items.find((li) => li.offsetLeft > el.scrollLeft + 4);
    el.scrollTo({ left: target ? target.offsetLeft : el.scrollWidth, behavior: "smooth" });
  };
  const auto = useAutoAdvance(next, 4000, { enabled: posts.length > 1 });

  if (posts.length === 0) return null;
  return (
    <section aria-label="Just in" className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5" {...auto.bind}>
      <h2 className="flex shrink-0 items-center gap-2 font-display text-base font-extrabold">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-gist ring-4 ring-gist/30" />
        Just in
      </h2>
      <ul id={id} ref={track} className="no-scrollbar relative flex min-w-0 flex-1 snap-x gap-6 overflow-x-auto scroll-smooth">
        {posts.map((p) => (
          <li key={p.id} className="flex shrink-0 snap-start items-center gap-6 text-sm">
            <Link to={postPath(p)} className="font-medium whitespace-nowrap hover:underline">{p.title}</Link>
            <span aria-hidden="true" className="size-1 rounded-full bg-muted" />
          </li>
        ))}
      </ul>
      {!auto.reduce && posts.length > 1 ? <PauseButton paused={auto.paused} onClick={auto.toggle} what="headlines" /> : null}
      <CarouselButton dir="next" label="More headlines" controls={id} disabled={false} onClick={next} />
    </section>
  );
}
