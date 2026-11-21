import type { ModerationComment, ModerationFilter, MyEngagement, PublicComment, StoryEngagement } from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { mapDbError } from "./errors.js";

export interface EngagementRepository {
  /** Anyone: a published story's like count and comment thread. */
  story(postId: string): Promise<StoryEngagement>;
  mine(actor: SessionClaims, postId: string): Promise<MyEngagement>;
  addComment(actor: SessionClaims, postId: string, body: string, parentId?: string): Promise<string>;
  editComment(actor: SessionClaims, id: string, body: string): Promise<void>;
  deleteComment(actor: SessionClaims, id: string): Promise<void>;
  likePost(actor: SessionClaims, postId: string, on: boolean): Promise<number>;
  likeComment(actor: SessionClaims, id: string, on: boolean): Promise<number>;
  report(actor: SessionClaims, id: string, reason: string): Promise<void>;
  setDisplayName(actor: SessionClaims, name: string): Promise<void>;
  /** Editors: comments to moderate. */
  moderation(actor: SessionClaims, filter: ModerationFilter): Promise<ModerationComment[]>;
  setHidden(actor: SessionClaims, id: string, hidden: boolean): Promise<void>;
}

type CommentRow = {
  id: string; parent_id: string | null; author_id: string | null; author_name: string | null; author_avatar: string | null;
  author_is_staff: boolean; body: string; removed: boolean; like_count: number; created_at: Date; edited: boolean;
};
type ModRow = {
  id: string; post_id: string; post_title: string; post_type: string; post_slug: string; parent_id: string | null;
  author_id: string; author_name: string; author_email: string; author_status: string; body: string; status: "visible" | "hidden";
  hidden_by_reports: boolean; report_count: number; report_reasons: string[]; like_count: number; created_at: Date;
};

const iso = (d: Date | string) => new Date(d).toISOString();

export function createEngagementRepository(db: Database): EngagementRepository {
  const as = <T>(actor: SessionClaims | null, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);

  return {
    story: (postId) =>
      as(null, async (q) => {
        const rows = await q.query<CommentRow>("select * from public.post_comments($1)", [postId]);
        const likes = await q.query<{ n: number }>("select public.post_like_count($1) as n", [postId]);
        const comments: PublicComment[] = rows.map((r) => ({
          id: r.id,
          parentId: r.parent_id,
          author: r.author_id ? { id: r.author_id, name: r.author_name ?? "Reader", avatarUrl: r.author_avatar, isStaff: r.author_is_staff } : null,
          body: r.body,
          removed: r.removed,
          likes: r.like_count,
          createdAt: iso(r.created_at),
          edited: r.edited,
        }));
        return { likes: likes[0]?.n ?? 0, comments };
      }),

    mine: (actor, postId) =>
      as(actor, async (q) => {
        const r = (await q.query<{ liked_post: boolean; liked_comment_ids: string[] }>("select * from public.my_post_engagement($1)", [postId]))[0];
        return { likedPost: r?.liked_post ?? false, likedCommentIds: r?.liked_comment_ids ?? [] };
      }),

    addComment: (actor, postId, body, parentId) =>
      as(actor, async (q) => (await q.query<{ id: string }>("select public.comment_add($1, $2, $3) as id", [postId, body, parentId ?? null]))[0]!.id),

    editComment: (actor, id, body) =>
      as(actor, async (q) => {
        await q.query("select public.comment_edit($1, $2)", [id, body]);
      }),

    deleteComment: (actor, id) =>
      as(actor, async (q) => {
        await q.query("select public.comment_delete($1)", [id]);
      }),

    likePost: (actor, postId, on) =>
      as(actor, async (q) => (await q.query<{ n: number }>("select public.post_like_set($1, $2) as n", [postId, on]))[0]!.n),

    likeComment: (actor, id, on) =>
      as(actor, async (q) => (await q.query<{ n: number }>("select public.comment_like_set($1, $2) as n", [id, on]))[0]!.n),

    report: (actor, id, reason) =>
      as(actor, async (q) => {
        await q.query("select public.comment_report($1, $2)", [id, reason]);
      }),

    setDisplayName: (actor, name) =>
      as(actor, async (q) => {
        await q.query("update public.users set name = $2 where id = $1", [actor.sub, name]);
      }),

    moderation: (actor, filter) =>
      as(actor, async (q) =>
        (await q.query<ModRow>("select * from public.moderation_comments($1, 150)", [filter])).map((r) => ({
          id: r.id,
          post: { id: r.post_id, title: r.post_title, type: r.post_type, slug: r.post_slug },
          parentId: r.parent_id,
          author: { id: r.author_id, name: r.author_name, email: r.author_email, status: r.author_status },
          body: r.body,
          status: r.status,
          hiddenByReports: r.hidden_by_reports,
          reports: r.report_count,
          reportReasons: r.report_reasons,
          likes: r.like_count,
          createdAt: iso(r.created_at),
        })),
      ),

    setHidden: (actor, id, hidden) =>
      as(actor, async (q) => {
        await q.query("select public.comment_set_hidden($1, $2)", [id, hidden]);
      }),
  };
}
