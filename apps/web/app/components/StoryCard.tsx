import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { formatDate, SECTION_LABEL } from "~/lib/format";
import { Avatar } from "./Avatar";
import { PostImage } from "./PostImage";

/** Category (or Sponsored) label sitting on the image. */
export function Pill({ post }: { post: PostSummary }) {
  const label = post.isSponsored ? "Sponsored" : (post.category?.name ?? SECTION_LABEL[post.type]);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${post.isSponsored ? "bg-ink text-paper" : "glass-photo"}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${post.isSponsored ? "bg-gist" : "bg-link"}`} />
      {label}
    </span>
  );
}

export function CardMeta({ post }: { post: PostSummary }) {
  const author = post.author?.name ?? "CoinGist Desk";
  return (
    <div className="relative z-10 flex items-center gap-2 text-sm text-muted">
      <Avatar name={author} url={post.author?.avatarUrl} />
      {post.author ? (
        <Link to={`/author/${post.author.slug}`} className="font-medium text-ink hover:underline">{author}</Link>
      ) : (
        <span className="font-medium text-ink">{author}</span>
      )}
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
      <span className="ml-auto whitespace-nowrap">{post.readMinutes} min read</span>
    </div>
  );
}

/** Card for carousels and grids: image with label, headline, byline row. */
export function StoryCard({ post, headingLevel = 3 }: { post: PostSummary; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="glass relative flex h-full flex-col overflow-hidden rounded-3xl">
      <div className="relative">
        <PostImage image={post.heroImage} sizes="(min-width: 1024px) 380px, 80vw" className="w-full rounded-none" />
        <div className="absolute bottom-3 left-3"><Pill post={post} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <H className="font-display text-lg leading-snug font-bold text-pretty">
          <Link to={postPath(post)} className="after:absolute after:inset-0 hover:underline">{post.title}</Link>
        </H>
        <div className="mt-auto"><CardMeta post={post} /></div>
      </div>
    </article>
  );
}
