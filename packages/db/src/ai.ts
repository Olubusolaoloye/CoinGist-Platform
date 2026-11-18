import type { AiFeature, AiUsageEntry, InternalLinkSuggestion } from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";

/** AI assist bookkeeping. Calls run as the signed-in staff member (RLS applies). */
export interface AiRepository {
  /** Requests the actor made since `since` (for the daily limit). */
  countSince(actor: SessionClaims, since: Date): Promise<number>;
  record(
    actor: SessionClaims,
    entry: { feature: AiFeature; postId: string | null; provider: "claude" | "offline"; model: string | null; inputTokens: number; outputTokens: number },
  ): Promise<void>;
  /** AI requests made on a story (who, what, when). */
  postUsage(actor: SessionClaims, postId: string): Promise<AiUsageEntry[]>;
  /** Throws not_found unless the actor can see the story in Studio. */
  assertCanUsePost(actor: SessionClaims, postId: string): Promise<void>;
  /** Published stories related to this one, for internal links. */
  internalLinks(actor: SessionClaims, postId: string, limit?: number): Promise<InternalLinkSuggestion[]>;
  /** Recently published titles, to spot topics CoinGist has already covered. */
  recentTitles(actor: SessionClaims, days: number): Promise<Array<{ id: string; title: string }>>;
}

export function createAiRepository(db: Database): AiRepository {
  const as = <T>(actor: SessionClaims, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);

  return {
    countSince: (actor, since) =>
      as(actor, async (q) => {
        const [r] = await q.query<{ n: number }>(
          "select count(*)::int as n from public.ai_usage where user_id = $1 and created_at >= $2",
          [actor.sub, since.toISOString()],
        );
        return r!.n;
      }),

    record: (actor, e) =>
      as(actor, async (q) => {
        await q.query(
          `insert into public.ai_usage (user_id, feature, post_id, provider, model, input_tokens, output_tokens)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [actor.sub, e.feature, e.postId, e.provider, e.model, e.inputTokens, e.outputTokens],
        );
      }),

    postUsage: (actor, postId) =>
      as(actor, async (q) =>
        (
          await q.query<{ feature: AiFeature; user_name: string | null; provider: "claude" | "offline"; created_at: Date }>(
            `select a.feature, u.name as user_name, a.provider, a.created_at
             from public.ai_usage a left join public.users u on u.id = a.user_id
             where a.post_id = $1 order by a.created_at desc limit 50`,
            [postId],
          )
        ).map((r) => ({ feature: r.feature, userName: r.user_name, provider: r.provider, createdAt: new Date(r.created_at).toISOString() })),
      ),

    assertCanUsePost: (actor, postId) =>
      as(actor, async (q) => {
        const rows = await q.query("select 1 from public.posts where id = $1", [postId]);
        if (!rows.length) throw new DomainError("not_found", "Post not found");
      }),

    internalLinks: (actor, postId, limit = 6) =>
      as(actor, async (q) => {
        // Match on any meaningful word of this story's title, excerpt, tags, category and the
        // start of its body, ranked by relevance (OR query, so partial overlaps still surface).
        const rows = await q.query<{ id: string; title: string; type: string; slug: string; published_at: Date }>(
          `with me as (
             select p.id,
                    nullif(replace(plainto_tsquery('english',
                      concat_ws(' ', p.title, p.excerpt, c.name,
                        left(jsonb_path_query_array(p.body_json, 'lax $.**.text')::text, 1500),
                        (select string_agg(t.name, ' ') from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = p.id))
                    )::text, '&', '|'), '')::tsquery as q
             from public.posts p left join public.categories c on c.id = p.category_id
             where p.id = $1
           )
           select o.id, o.title, o.type::text as type, o.slug, o.published_at
           from public.posts o, me
           where o.status = 'published' and o.published_at <= now() and o.id <> me.id
             and me.q is not null and o.search @@ me.q
           order by ts_rank(o.search, me.q) desc, o.published_at desc
           limit $2`,
          [postId, limit],
        );
        return rows.map((r) => ({
          id: r.id, title: r.title, type: r.type, slug: r.slug, path: `/${r.type}/${r.slug}`,
          publishedAt: new Date(r.published_at).toISOString(),
        }));
      }),

    recentTitles: (actor, days) =>
      as(actor, (q) =>
        q.query<{ id: string; title: string }>(
          `select id, title from public.posts
           where status = 'published' and published_at >= now() - make_interval(days => $1)
           order by published_at desc limit 60`,
          [days],
        ),
      ),
  };
}
