import { Link } from "react-router";
import type { PostStatus, StudioPostSummary } from "@coingist/types";
import { formatWhen } from "~/lib/format";
import { STATUS_LABEL } from "~/lib/workflow";

type Column = { key: string; title: string; statuses: PostStatus[]; empty: string };

const COLUMNS: Column[] = [
  { key: "drafts", title: "Drafts", statuses: ["draft", "changes_requested"], empty: "No drafts. Start a new story." },
  { key: "review", title: "In review", statuses: ["in_review"], empty: "Nothing waiting for an editor." },
  { key: "ready", title: "Approved", statuses: ["approved", "scheduled"], empty: "Approved stories wait here to be published." },
  { key: "live", title: "Published", statuses: ["published"], empty: "Published stories show up here." },
];

/** Where a story is in the workflow: written, edited, live. */
const STAGE: Record<PostStatus, number> = { draft: 0, changes_requested: 0, in_review: 1, approved: 2, scheduled: 2, published: 3 };

/** Tints say what needs attention: yellow waits for an editor, red has changes asked, blue is ready. */
const TINT: Partial<Record<PostStatus, string>> = {
  changes_requested: "bg-gradient-to-b from-[#fde2e1] to-surface dark:from-[#4a1f2a] border-[#f4c4c1] dark:border-[#6b2a35]",
  in_review: "bg-gradient-to-b from-[#fff1c7] to-surface dark:from-[#3d3418] border-[#fde2a0] dark:border-[#5a4a1c]",
  approved: "bg-gradient-to-b from-[#dbeefe] to-surface dark:from-[#16304d] border-[#bfdcf5] dark:border-[#24486e]",
  scheduled: "bg-gradient-to-b from-[#dbeefe] to-surface dark:from-[#16304d] border-[#bfdcf5] dark:border-[#24486e]",
};
const BAR: Partial<Record<PostStatus, string>> = {
  changes_requested: "bg-bad",
  in_review: "bg-[#d99a00]",
  approved: "bg-[#2c7fc0]",
  scheduled: "bg-[#2c7fc0]",
};

function Progress({ status }: { status: PostStatus }) {
  const done = STAGE[status];
  const fill = BAR[status] ?? "bg-link";
  const stages = ["Writer", "Editor", "Live"];
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {stages.map((s, i) => (
          <span key={s} className={`h-1.5 rounded-full ${i < done ? fill : i === done ? `${fill} opacity-35` : "bg-line"}`} />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs text-muted" aria-hidden="true">
        {stages.map((s) => <span key={s}>{s}</span>)}
      </div>
      <p className="sr-only">Status: {STATUS_LABEL[status]}</p>
    </div>
  );
}

function Card({ post }: { post: StudioPostSummary }) {
  const tint = TINT[post.status] ?? "bg-surface border-line";
  return (
    <article className={`relative rounded-2xl border p-4 shadow-[0_10px_28px_-24px_rgb(20_22_63/0.5)] transition-shadow hover:shadow-[0_14px_34px_-20px_rgb(20_22_63/0.55)] ${tint}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface/80 px-2.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">
          {post.category?.name ?? post.type}
        </span>
        {post.aiAssisted ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-muted" title="AI helped draft or edit this story">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 19L15 9M14 4v3M17.5 5.5l-2 2M20 10h-3M12 6.5l1.5 1.5" />
            </svg>
            AI-assisted
          </span>
        ) : null}
      </div>
      {post.heroImage ? (
        <img src={post.heroImage.url} alt="" loading="lazy" className="mt-3 aspect-[16/8] w-full rounded-xl object-cover" />
      ) : null}
      <h3 className="mt-3 font-display text-[1.05rem] leading-snug font-bold text-pretty">
        <Link to={`/posts/${post.id}`} className="after:absolute after:inset-0 hover:underline">{post.title}</Link>
      </h3>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-gist text-[0.65rem] font-bold text-gist-ink">
          {(post.author.name ?? "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
        </span>
        <span className="truncate font-medium text-ink">{post.author.name ?? "Unknown"}</span>
        <span className="ml-auto whitespace-nowrap text-xs">
          {post.status === "scheduled" && post.scheduledFor ? `Goes live ${formatWhen(post.scheduledFor)}` : formatWhen(post.updatedAt)}
        </span>
      </div>
      {post.openComments > 0 || post.status === "changes_requested" ? (
        <p className="mt-2 text-xs font-semibold text-bad">
          {post.status === "changes_requested" ? "Changes requested" : ""}
          {post.status === "changes_requested" && post.openComments > 0 ? ", " : ""}
          {post.openComments > 0 ? `${post.openComments} open comment${post.openComments === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}
      <div className="mt-3"><Progress status={post.status} /></div>
    </article>
  );
}

/** Stories as a board: one column per workflow stage, newest activity first. */
export function StoryBoard({ posts }: { posts: StudioPostSummary[] }) {
  return (
    <div className="no-scrollbar -mx-3 flex snap-x gap-4 overflow-x-auto px-3 pb-4 sm:-mx-5 sm:px-5 xl:grid xl:grid-cols-4 xl:overflow-visible">
      {COLUMNS.map((col) => {
        const items = posts.filter((p) => col.statuses.includes(p.status));
        return (
          <section key={col.key} aria-labelledby={`col-${col.key}`} className="glass flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-3xl p-3 sm:w-80 xl:w-auto xl:max-w-none">
            <h2 id={`col-${col.key}`} className="py-2 text-center font-display text-lg font-bold">
              {col.title} <span className="font-sans text-base font-medium text-muted">({items.length})</span>
            </h2>
            {items.length ? (
              <ul className="mt-1 space-y-3">
                {items.map((p) => <li key={p.id}><Card post={p} /></li>)}
              </ul>
            ) : (
              <p className="m-1 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{col.empty}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
