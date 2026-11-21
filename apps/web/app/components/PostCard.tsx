import { Link } from "react-router";
import { postPath, type PostSummary } from "@coingist/types";
import { SECTION_LABEL } from "~/lib/format";
import { Byline } from "./Byline";
import { PostImage } from "./PostImage";
import { SponsoredBadge } from "./SponsoredBadge";

function Kicker({ post }: { post: PostSummary }) {
  if (post.isSponsored) return <SponsoredBadge sponsor={post.sponsorName} />;
  const label = post.category?.name ?? SECTION_LABEL[post.type];
  return <span className="text-sm font-semibold text-link">{label}</span>;
}

/** Whole-card link without nesting links: the title link stretches over the card. */
function TitleLink({ post, className }: { post: PostSummary; className: string }) {
  return (
    <Link to={postPath(post)} className={`after:absolute after:inset-0 ${className}`}>
      {post.title}
    </Link>
  );
}

export function LeadStory({ post }: { post: PostSummary }) {
  return (
    <article className="relative">
      <PostImage image={post.heroImage} priority sizes="(min-width: 1024px) 720px, 100vw" />
      <div className="mt-4">
        <Kicker post={post} />
        <h2 className="mt-1 font-display text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.6rem]">
          <TitleLink post={post} className="" />
        </h2>
        {post.excerpt ? <p className="mt-3 max-w-[60ch] text-lg text-muted">{post.excerpt}</p> : null}
        <Byline post={post} className="relative z-10 mt-3" />
      </div>
    </article>
  );
}

type HeadingLevel = 2 | 3;

export function StoryRow({
  post,
  showImage = true,
  headingLevel = 3,
}: {
  post: PostSummary;
  showImage?: boolean;
  headingLevel?: HeadingLevel;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="relative flex gap-4 py-4">
      <div className="min-w-0 flex-1">
        <Kicker post={post} />
        <Heading className="mt-0.5 font-display text-[1.15rem] leading-snug font-bold text-pretty">
          <TitleLink post={post} className="" />
        </Heading>
        <Byline post={post} className="relative z-10 mt-1.5" />
      </div>
      {showImage && post.heroImage ? (
        <PostImage image={post.heroImage} ratio="photo" sizes="128px" className="w-28 shrink-0 sm:w-32" />
      ) : null}
    </article>
  );
}

export function StoryTile({ post }: { post: PostSummary }) {
  return (
    <article className="relative">
      <PostImage image={post.heroImage} sizes="(min-width: 768px) 33vw, 100vw" />
      <div className="mt-3">
        <Kicker post={post} />
        <h3 className="mt-0.5 font-display text-lg leading-snug font-bold text-pretty">
          <TitleLink post={post} className="" />
        </h3>
        <Byline post={post} className="relative z-10 mt-1.5" />
      </div>
    </article>
  );
}

/** Use headingLevel={2} when the list sits directly under the page's <h1>. */
export function StoryList({
  posts,
  showImages = true,
  headingLevel = 3,
}: {
  posts: PostSummary[];
  showImages?: boolean;
  headingLevel?: HeadingLevel;
}) {
  return (
    <div className="divide-y divide-line">
      {posts.map((p) => (
        <StoryRow key={p.id} post={p} showImage={showImages} headingLevel={headingLevel} />
      ))}
    </div>
  );
}
