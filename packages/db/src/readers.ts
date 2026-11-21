import type { FeedStory, FollowInput, FollowTarget, FollowType, Paginated, ReaderFeed, ReaderState, SavedStory } from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";
import { SUMMARY_FROM, SUMMARY_SELECT, toSummary, type SummaryRow } from "./content.js";

/** A signed-in reader's own saved stories and follows. RLS limits every query to their rows. */
export interface ReaderRepository {
  listBookmarks(actor: SessionClaims, q: { page: number; pageSize: number }): Promise<Paginated<SavedStory>>;
  addBookmark(actor: SessionClaims, postId: string): Promise<void>;
  removeBookmark(actor: SessionClaims, postId: string): Promise<void>;
  listFollows(actor: SessionClaims): Promise<FollowTarget[]>;
  follow(actor: SessionClaims, input: FollowInput): Promise<FollowTarget>;
  unfollow(actor: SessionClaims, input: FollowInput): Promise<void>;
  state(actor: SessionClaims, postId: string | null): Promise<ReaderState>;
  feed(actor: SessionClaims, q: { page: number; pageSize: number }): Promise<ReaderFeed>;
  /** Forget everything this reader saved or followed. */
  clear(actor: SessionClaims): Promise<void>;
}

const PUBLISHED = "p.status = 'published' and p.published_at <= now()";

/** Resolve a public slug to the id stored in follows, with its display name. */
async function resolveTarget(q: Queryable, { type, slug }: FollowInput): Promise<{ id: string; name: string } | null> {
  const sql: Record<FollowType, string> = {
    author: "select user_id as id, name from public.author_directory where slug = $1",
    category: "select id, name from public.categories where slug = $1",
    tag: "select id, name from public.tags where slug = $1",
  };
  const rows = await q.query<{ id: string; name: string }>(sql[type], [slug]);
  return rows[0] ?? null;
}

const FOLLOWS_SQL = `
  select f.target_type as type, coalesce(a.slug, c.slug, t.slug) as slug, coalesce(a.name, c.name, t.name) as name
  from public.follows f
  left join public.author_directory a on f.target_type = 'author' and a.user_id = f.target_id
  left join public.categories c on f.target_type = 'category' and c.id = f.target_id
  left join public.tags t on f.target_type = 'tag' and t.id = f.target_id
  where f.user_id = $1 and coalesce(a.slug, c.slug, t.slug) is not null
  order by f.target_type, name`;

export function createReaderRepository(db: Database): ReaderRepository {
  const as = <T>(actor: SessionClaims, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);
  const follows = (q: Queryable, actor: SessionClaims) => q.query<FollowTarget>(FOLLOWS_SQL, [actor.sub]);

  return {
    listBookmarks: (actor, { page, pageSize }) =>
      as(actor, async (q) => {
        const rows = await q.query<SummaryRow & { saved_at: Date; total: number }>(
          `select ${SUMMARY_SELECT}, b.created_at as saved_at, count(*) over ()::int as total
           ${SUMMARY_FROM}
           join public.bookmarks b on b.post_id = p.id and b.user_id = $1
           where ${PUBLISHED}
           order by b.created_at desc limit $2 offset $3`,
          [actor.sub, pageSize, (page - 1) * pageSize],
        );
        return {
          items: rows.map((r) => ({ ...toSummary(r), savedAt: new Date(r.saved_at).toISOString() })),
          page, pageSize, total: rows[0]?.total ?? 0,
        };
      }),

    addBookmark: (actor, postId) =>
      as(actor, async (q) => {
        await q.query(
          "insert into public.bookmarks (user_id, post_id) values ($1, $2) on conflict do nothing",
          [actor.sub, postId],
        );
      }),

    removeBookmark: (actor, postId) =>
      as(actor, async (q) => {
        await q.query("delete from public.bookmarks where user_id = $1 and post_id = $2", [actor.sub, postId]);
      }),

    listFollows: (actor) => as(actor, (q) => follows(q, actor)),

    follow: (actor, input) =>
      as(actor, async (q) => {
        const target = await resolveTarget(q, input);
        if (!target) throw new DomainError("not_found", "Nothing to follow there");
        await q.query(
          "insert into public.follows (user_id, target_type, target_id) values ($1, $2, $3) on conflict do nothing",
          [actor.sub, input.type, target.id],
        );
        return { type: input.type, slug: input.slug, name: target.name };
      }),

    unfollow: (actor, input) =>
      as(actor, async (q) => {
        const target = await resolveTarget(q, input);
        if (!target) return;
        await q.query(
          "delete from public.follows where user_id = $1 and target_type = $2 and target_id = $3",
          [actor.sub, input.type, target.id],
        );
      }),

    state: (actor, postId) =>
      as(actor, async (q) => {
        const [b] = postId
          ? await q.query<{ n: number }>("select count(*)::int as n from public.bookmarks where user_id = $1 and post_id = $2", [actor.sub, postId])
          : [{ n: 0 }];
        return { bookmarked: (b?.n ?? 0) > 0, follows: await follows(q, actor) };
      }),

    feed: (actor, { page, pageSize }) =>
      as(actor, async (q) => {
        // Stories by followed writers, in followed categories, or with followed tags; newest first.
        // "because" names the most specific follow that matched: writer, then tag, then topic.
        const rows = await q.query<SummaryRow & { because_type: FollowType; because_name: string; total: number }>(
          `with f as (select target_type, target_id from public.follows where user_id = $1)
           select ${SUMMARY_SELECT}, count(*) over ()::int as total,
             coalesce(
               (select 'author' from f where f.target_type = 'author' and f.target_id = p.author_id),
               (select 'tag' from f join public.post_tags pt on pt.tag_id = f.target_id
                 where f.target_type = 'tag' and pt.post_id = p.id limit 1),
               'category') as because_type,
             coalesce(
               (select a2.name from f join public.author_directory a2 on a2.user_id = f.target_id
                 where f.target_type = 'author' and f.target_id = p.author_id),
               (select t.name from f join public.post_tags pt on pt.tag_id = f.target_id join public.tags t on t.id = pt.tag_id
                 where f.target_type = 'tag' and pt.post_id = p.id order by t.name limit 1),
               c.name) as because_name
           ${SUMMARY_FROM}
           where ${PUBLISHED} and (
             exists (select 1 from f where f.target_type = 'author' and f.target_id = p.author_id)
             or exists (select 1 from f where f.target_type = 'category' and f.target_id = p.category_id)
             or exists (select 1 from f join public.post_tags pt on pt.tag_id = f.target_id
                        where f.target_type = 'tag' and pt.post_id = p.id))
           order by p.published_at desc limit $2 offset $3`,
          [actor.sub, pageSize, (page - 1) * pageSize],
        );
        const items: FeedStory[] = rows.map((r) => ({ ...toSummary(r), because: { type: r.because_type, name: r.because_name } }));
        return { items, page, pageSize, total: rows[0]?.total ?? 0, follows: await follows(q, actor) };
      }),

    clear: (actor) =>
      as(actor, async (q) => {
        await q.query("delete from public.bookmarks where user_id = $1", [actor.sub]);
        await q.query("delete from public.follows where user_id = $1", [actor.sub]);
        await q.query("select public.forget_my_engagement()");
      }),
  };
}
