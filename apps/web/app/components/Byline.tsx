import { Link } from "react-router";
import type { PostSummary } from "@coingist/types";
import { formatDate } from "~/lib/format";

export function Byline({ post, className = "" }: { post: PostSummary; className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted ${className}`}>
      {post.author ? (
        <Link to={`/author/${post.author.slug}`} className="font-medium text-ink">
          {post.author.name}
        </Link>
      ) : (
        <span className="font-medium text-ink">CoinGist Desk</span>
      )}
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
    </p>
  );
}
