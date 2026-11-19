import { useId, useRef } from "react";
import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { CarouselButton } from "./Carousel";

/** The newest headlines in one scrollable line. No auto-scrolling. */
export function TrendingStrip({ posts }: { posts: PostSummary[] }) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);
  if (posts.length === 0) return null;
  return (
    <section aria-label="Just in" className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
      <h2 className="flex shrink-0 items-center gap-2 font-display text-base font-extrabold">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-gist ring-4 ring-gist/30" />
        Just in
      </h2>
      <ul id={id} ref={track} className="no-scrollbar flex min-w-0 flex-1 snap-x gap-6 overflow-x-auto scroll-smooth">
        {posts.map((p) => (
          <li key={p.id} className="flex shrink-0 snap-start items-center gap-6 text-sm">
            <Link to={postPath(p)} className="font-medium whitespace-nowrap hover:underline">{p.title}</Link>
            <span aria-hidden="true" className="size-1 rounded-full bg-muted" />
          </li>
        ))}
      </ul>
      <CarouselButton dir="next" label="More headlines" controls={id} disabled={false}
        onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * 0.8, behavior: "smooth" })} />
    </section>
  );
}
