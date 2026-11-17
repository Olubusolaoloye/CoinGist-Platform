import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { PostImage } from "./PostImage";
import { CardMeta, Pill } from "./StoryCard";

/** One wide slide of the featured carousel: image beside headline, excerpt and byline. */
export function FeaturedSlide({ post, priority }: { post: PostSummary; priority: boolean }) {
  return (
    <article className="relative grid h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:grid-cols-[1.1fr_1fr]">
      <PostImage image={post.heroImage} priority={priority} sizes="(min-width: 1024px) 420px, 90vw" className="w-full rounded-none md:h-full md:aspect-auto" />
      <div className="flex flex-col gap-3 p-5 sm:p-7">
        <div><Pill post={post} /></div>
        <h3 className="font-display text-2xl leading-tight font-extrabold text-balance sm:text-[1.7rem]">
          <Link to={postPath(post)} className="after:absolute after:inset-0 hover:underline">{post.title}</Link>
        </h3>
        {post.excerpt ? <p className="line-clamp-3 text-muted">{post.excerpt}</p> : null}
        <div className="mt-auto pt-2"><CardMeta post={post} /></div>
      </div>
    </article>
  );
}
