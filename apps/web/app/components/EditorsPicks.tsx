import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { formatDate } from "~/lib/format";
import { PostImage } from "./PostImage";

/** Numbered list of stories editors have chosen (a ranking, so the numbers mean something). */
export function EditorsPicks({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="picks-h" className="glass rounded-3xl p-5">
      <h2 id="picks-h" className="font-display text-xl font-extrabold">Editors' picks</h2>
      <ol className="mt-3 divide-y divide-line">
        {posts.map((p, i) => (
          <li key={p.id} className="relative flex items-center gap-3 py-3">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-paper">
              {i + 1}
            </span>
            <PostImage image={p.heroImage} ratio="photo" sizes="64px" className="w-16 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-[0.95rem] leading-snug font-semibold">
                <Link to={postPath(p)} className="after:absolute after:inset-0">{p.title}</Link>
              </h3>
              <time dateTime={p.publishedAt} className="text-xs text-muted">{formatDate(p.publishedAt)}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
