import {
  sanitizeRichText,
  slugify,
  type Category,
  type CategoryRef,
  type CommentInput,
  type CreatePostInput,
  type EditorialComment,
  type Paginated,
  type PostStatus,
  type PostType,
  type Revision,
  type RevisionSummary,
  type RichTextDoc,
  type StudioPost,
  type StudioPostSummary,
  type TagRef,
  type TransitionInput,
  type UpdateCategoryInput,
  type UpdatePostInput,
} from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";

/**
 * Studio data access. Every call runs as the signed-in staff member, so RLS, column grants
 * and the workflow function decide what is allowed. The API checks permissions first; this
 * layer is the second line of defence.
 */
export interface StudioRepository {
  listPosts(
    actor: SessionClaims,
    q: { status?: PostStatus | undefined; mine?: boolean; page: number; pageSize: number },
  ): Promise<Paginated<StudioPostSummary>>;
  reviewQueue(actor: SessionClaims): Promise<StudioPostSummary[]>;
  getPost(actor: SessionClaims, id: string): Promise<StudioPost | null>;
  createPost(actor: SessionClaims, input: CreatePostInput): Promise<StudioPost>;
  updatePost(actor: SessionClaims, id: string, input: UpdatePostInput): Promise<StudioPost>;
  deletePost(actor: SessionClaims, id: string): Promise<void>;
  transition(actor: SessionClaims, id: string, input: TransitionInput): Promise<StudioPost>;
  listComments(actor: SessionClaims, postId: string): Promise<EditorialComment[]>;
  addComment(actor: SessionClaims, postId: string, input: CommentInput): Promise<EditorialComment>;
  setCommentResolved(actor: SessionClaims, commentId: string, resolved: boolean): Promise<EditorialComment>;
  listRevisions(actor: SessionClaims, postId: string): Promise<RevisionSummary[]>;
  getRevision(actor: SessionClaims, revisionId: string): Promise<Revision | null>;
  listCategories(actor: SessionClaims): Promise<CategoryRef[]>;
  listTags(actor: SessionClaims): Promise<TagRef[]>;
  /** Full category records (with cover images) for Admin → Site images. */
  listCategoryDetails(actor: SessionClaims): Promise<Category[]>;
  /** RLS: editors and admins may update categories. Null when not found. */
  updateCategory(actor: SessionClaims, slug: string, input: UpdateCategoryInput): Promise<Category | null>;
}

const iso = (d: Date | string | null) =>
  d === null ? null : (d instanceof Date ? d : new Date(d)).toISOString();

export type StudioSummaryRow = {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  status: PostStatus;
  author_id: string;
  author_name: string | null;
  category_slug: string | null;
  category_name: string | null;
  updated_at: Date;
  scheduled_for: Date | null;
  published_at: Date | null;
  open_comments: number;
  total?: number;
};

export const STUDIO_SUMMARY_SQL = `
  select p.id, p.type, p.title, p.slug, p.status, p.author_id, u.name as author_name,
         c.slug as category_slug, c.name as category_name,
         p.updated_at, p.scheduled_for, p.published_at,
         (select count(*)::int from public.editorial_comments ec
           where ec.post_id = p.id and ec.resolved_at is null) as open_comments
  from public.posts p
  left join public.users u on u.id = p.author_id
  left join public.categories c on c.id = p.category_id`;

export const toStudioSummary = (r: StudioSummaryRow): StudioPostSummary => ({
  id: r.id,
  type: r.type,
  title: r.title,
  slug: r.slug,
  status: r.status,
  author: { id: r.author_id, name: r.author_name },
  category: r.category_slug ? { slug: r.category_slug, name: r.category_name! } : null,
  updatedAt: iso(r.updated_at)!,
  scheduledFor: iso(r.scheduled_for),
  publishedAt: iso(r.published_at),
  openComments: r.open_comments,
});

type PostRow = {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  excerpt: string | null;
  summary_bullets: string[];
  body_json: RichTextDoc;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: TagRef[] | null;
  author_id: string;
  author_name: string | null;
  status: PostStatus;
  approved_by: string | null;
  approver_name: string | null;
  approved_at: Date | null;
  scheduled_for: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  seo_title: string | null;
  seo_description: string | null;
  canonical: string | null;
  is_sponsored: boolean;
  sponsor_id: string | null;
  ai_assisted: boolean;
  featured: boolean;
};

const POST_SQL = `
  select p.*, u.name as author_name, a.name as approver_name,
         c.slug as category_slug, c.name as category_name,
         (select coalesce(json_agg(json_build_object('slug', t.slug, 'name', t.name) order by t.name), '[]'::json)
            from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = p.id) as tags
  from public.posts p
  left join public.users u on u.id = p.author_id
  left join public.users a on a.id = p.approved_by
  left join public.categories c on c.id = p.category_id
  where p.id = $1`;

const toPost = (r: PostRow): StudioPost => ({
  id: r.id,
  type: r.type,
  title: r.title,
  slug: r.slug,
  excerpt: r.excerpt,
  summaryBullets: r.summary_bullets,
  body: r.body_json,
  heroImage: r.hero_image_url ? { url: r.hero_image_url, alt: r.hero_image_alt ?? "" } : null,
  category: r.category_slug ? { slug: r.category_slug, name: r.category_name! } : null,
  tags: r.tags ?? [],
  author: { id: r.author_id, name: r.author_name },
  status: r.status,
  approvedBy: r.approved_by ? { id: r.approved_by, name: r.approver_name } : null,
  approvedAt: iso(r.approved_at),
  scheduledFor: iso(r.scheduled_for),
  publishedAt: iso(r.published_at),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  seoTitle: r.seo_title,
  seoDescription: r.seo_description,
  canonical: r.canonical,
  isSponsored: r.is_sponsored,
  sponsorId: r.sponsor_id,
  aiAssisted: r.ai_assisted,
  featured: r.featured,
});

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string | null;
  body: string;
  resolved_at: Date | null;
  created_at: Date;
};
const COMMENT_SQL = `
  select ec.id, ec.post_id, ec.parent_id, ec.author_id, u.name as author_name, ec.body,
         ec.resolved_at, ec.created_at
  from public.editorial_comments ec left join public.users u on u.id = ec.author_id`;
const toComment = (r: CommentRow): EditorialComment => ({
  id: r.id,
  postId: r.post_id,
  parentId: r.parent_id,
  author: { id: r.author_id, name: r.author_name },
  body: r.body,
  resolvedAt: iso(r.resolved_at),
  createdAt: iso(r.created_at)!,
});

async function loadPost(q: Queryable, id: string): Promise<StudioPost | null> {
  const rows = await q.query<PostRow>(POST_SQL, [id]);
  return rows[0] ? toPost(rows[0]) : null;
}

/** After a write touched no rows: tell "can't see it" (404) from "can't change it" (403). */
async function missingOrForbidden(q: Queryable, id: string): Promise<never> {
  const rows = await q.query("select 1 from public.posts where id = $1", [id]);
  throw rows.length
    ? new DomainError("forbidden", "You can't edit this post in its current state")
    : new DomainError("not_found", "Post not found");
}

/**
 * Scheduler job: publish every scheduled post whose time has come. Runs as the service role,
 * which transition_post() only allows for due scheduled posts. Returns the published ids.
 */
export async function publishDueScheduled(db: Database): Promise<string[]> {
  const due = await db.asService((q) =>
    q.query<{ id: string }>(
      "select id from public.posts where status = 'scheduled' and scheduled_for <= now() order by scheduled_for limit 100",
    ),
  );
  const published: string[] = [];
  for (const { id } of due) {
    try {
      await db.asService((q) => q.query("select 1 from public.transition_post($1, 'published')", [id]));
      published.push(id);
    } catch (err) {
      // One bad post must not block the rest; it stays scheduled and is retried next run.
      console.error(`scheduler: could not publish ${id}`, err);
    }
  }
  return published;
}

export function createStudioRepository(db: Database): StudioRepository {
  const as = <T>(actor: SessionClaims, fn: (q: Queryable) => Promise<T>) =>
    db.asUser(actor, fn).catch(mapDbError);

  return {
    listPosts: (actor, { status, mine, page, pageSize }) =>
      as(actor, async (q) => {
        const rows = await q.query<StudioSummaryRow>(
          `select *, count(*) over ()::int as total from (${STUDIO_SUMMARY_SQL}
             where ($1::public.post_status is null or p.status = $1)
               and (not $2::boolean or p.author_id = $3)) s
           order by updated_at desc limit $4 offset $5`,
          [status ?? null, mine ?? false, actor.sub, pageSize, (page - 1) * pageSize],
        );
        return { items: rows.map(toStudioSummary), page, pageSize, total: rows[0]?.total ?? 0 };
      }),

    reviewQueue: (actor) =>
      as(actor, async (q) => {
        const rows = await q.query<StudioSummaryRow>(
          `${STUDIO_SUMMARY_SQL} where p.status = 'in_review' and p.author_id <> $1
           order by p.updated_at asc limit 100`,
          [actor.sub],
        );
        return rows.map(toStudioSummary);
      }),

    getPost: (actor, id) => as(actor, (q) => loadPost(q, id)),

    createPost: (actor, input) =>
      as(actor, async (q) => {
        const base = slugify(input.title);
        const slug = (await slugExistsAnywhere(q, base))
          ? `${base.slice(0, 72)}-${Math.random().toString(36).slice(2, 8)}`
          : base;
        const rows = await q.query<{ id: string }>(
          `insert into public.posts (type, title, slug, author_id, is_sponsored)
           values ($1, $2, $3, $4, $5) returning id`,
          [input.type, input.title, slug, actor.sub, input.type === "sponsored"],
        );
        return (await loadPost(q, rows[0]!.id))!;
      }),

    updatePost: (actor, id, input) =>
      as(actor, async (q) => {
        const sets: string[] = [];
        const params: unknown[] = [id];
        const set = (col: string, value: unknown, cast = "") => {
          params.push(value);
          sets.push(`${col} = $${params.length}${cast}`);
        };

        if (input.type !== undefined) set("type", input.type, "::public.post_type");
        if (input.title !== undefined) set("title", input.title);
        if (input.slug !== undefined) set("slug", input.slug);
        if (input.excerpt !== undefined) set("excerpt", input.excerpt);
        if (input.summaryBullets !== undefined) set("summary_bullets", input.summaryBullets);
        if (input.body !== undefined) set("body_json", JSON.stringify(sanitizeRichText(input.body)), "::jsonb");
        if (input.heroImageUrl !== undefined) set("hero_image_url", input.heroImageUrl);
        if (input.heroImageAlt !== undefined) set("hero_image_alt", input.heroImageAlt);
        if (input.seoTitle !== undefined) set("seo_title", input.seoTitle);
        if (input.seoDescription !== undefined) set("seo_description", input.seoDescription);
        if (input.canonical !== undefined) set("canonical", input.canonical);
        if (input.isSponsored !== undefined) set("is_sponsored", input.isSponsored);
        if (input.sponsorId !== undefined) set("sponsor_id", input.sponsorId);
        if (input.aiAssisted !== undefined) set("ai_assisted", input.aiAssisted);
        if (input.featured !== undefined) set("featured", input.featured);
        if (input.categorySlug !== undefined) {
          if (input.categorySlug === null) set("category_id", null);
          else {
            const cat = await q.query<{ id: string }>("select id from public.categories where slug = $1", [
              input.categorySlug,
            ]);
            if (!cat[0]) throw new DomainError("invalid", `Unknown category: ${input.categorySlug}`);
            set("category_id", cat[0].id);
          }
        }

        if (sets.length > 0) {
          const updated = await q.query(
            `update public.posts set ${sets.join(", ")} where id = $1 returning id`,
            params,
          );
          if (updated.length === 0) await missingOrForbidden(q, id);
        } else {
          // Tag-only update still needs edit rights; can_edit_post is enforced by post_tags RLS.
          const visible = await q.query("select 1 from public.posts where id = $1", [id]);
          if (visible.length === 0) throw new DomainError("not_found", "Post not found");
        }

        if (input.tagSlugs !== undefined) {
          const tags = await q.query<{ id: string; slug: string }>(
            "select id, slug from public.tags where slug = any($1::text[])",
            [input.tagSlugs],
          );
          const unknown = input.tagSlugs.filter((s) => !tags.some((t) => t.slug === s));
          if (unknown.length) throw new DomainError("invalid", `Unknown tags: ${unknown.join(", ")}`);
          await q.query("delete from public.post_tags where post_id = $1", [id]);
          for (const t of tags) {
            await q.query("insert into public.post_tags (post_id, tag_id) values ($1, $2)", [id, t.id]);
          }
        }

        return (await loadPost(q, id))!;
      }),

    deletePost: (actor, id) =>
      as(actor, async (q) => {
        const rows = await q.query("delete from public.posts where id = $1 returning id", [id]);
        if (rows.length === 0) await missingOrForbidden(q, id);
      }),

    transition: (actor, id, input) =>
      as(actor, async (q) => {
        await q.query(
          "select 1 from public.transition_post($1, $2::public.post_status, $3::timestamptz, $4)",
          [id, input.to, input.scheduledFor ?? null, input.note ?? null],
        );
        if (input.note && ["changes_requested", "approved"].includes(input.to)) {
          // The reviewer's note also goes on the post thread so the writer sees it in context.
          await q.query(
            "insert into public.editorial_comments (post_id, author_id, body) values ($1, $2, $3)",
            [id, actor.sub, input.note],
          );
        }
        const post = await loadPost(q, id);
        if (!post) throw new DomainError("not_found", "Post not found");
        return post;
      }),

    listComments: (actor, postId) =>
      as(actor, async (q) =>
        (await q.query<CommentRow>(`${COMMENT_SQL} where ec.post_id = $1 order by ec.created_at`, [postId])).map(
          toComment,
        ),
      ),

    addComment: (actor, postId, input) =>
      as(actor, async (q) => {
        const rows = await q.query<{ id: string }>(
          `insert into public.editorial_comments (post_id, author_id, parent_id, body)
           values ($1, $2, $3, $4) returning id`,
          [postId, actor.sub, input.parentId ?? null, input.body],
        );
        const out = await q.query<CommentRow>(`${COMMENT_SQL} where ec.id = $1`, [rows[0]!.id]);
        return toComment(out[0]!);
      }),

    setCommentResolved: (actor, commentId, resolved) =>
      as(actor, async (q) => {
        const rows = await q.query<{ id: string }>(
          `update public.editorial_comments
           set resolved_at = case when $2 then now() else null end,
               resolved_by = case when $2 then $3::uuid else null end
           where id = $1 returning id`,
          [commentId, resolved, actor.sub],
        );
        if (!rows[0]) throw new DomainError("not_found", "Comment not found");
        const out = await q.query<CommentRow>(`${COMMENT_SQL} where ec.id = $1`, [commentId]);
        return toComment(out[0]!);
      }),

    listRevisions: (actor, postId) =>
      as(actor, async (q) => {
        const rows = await q.query<{ id: string; title: string; editor_id: string | null; editor_name: string | null; created_at: Date }>(
          `select r.id, r.title, r.editor_id, u.name as editor_name, r.created_at
           from public.post_revisions r left join public.users u on u.id = r.editor_id
           where r.post_id = $1 order by r.created_at desc limit 100`,
          [postId],
        );
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          editor: r.editor_id ? { id: r.editor_id, name: r.editor_name } : null,
          createdAt: iso(r.created_at)!,
        }));
      }),

    getRevision: (actor, revisionId) =>
      as(actor, async (q) => {
        const rows = await q.query<{ id: string; title: string; body_json: RichTextDoc; editor_id: string | null; editor_name: string | null; created_at: Date }>(
          `select r.id, r.title, r.body_json, r.editor_id, u.name as editor_name, r.created_at
           from public.post_revisions r left join public.users u on u.id = r.editor_id
           where r.id = $1`,
          [revisionId],
        );
        const r = rows[0];
        return r
          ? {
              id: r.id,
              title: r.title,
              body: r.body_json,
              editor: r.editor_id ? { id: r.editor_id, name: r.editor_name } : null,
              createdAt: iso(r.created_at)!,
            }
          : null;
      }),

    listCategories: (actor) =>
      as(actor, (q) => q.query<CategoryRef>("select slug, name from public.categories order by sort_order, name")),
    listTags: (actor) => as(actor, (q) => q.query<TagRef>("select slug, name from public.tags order by name")),

    listCategoryDetails: (actor) =>
      as(actor, async (q) => {
        const rows = await q.query<CategoryDetailRow>(
          "select slug, name, description, image_url, image_alt from public.categories order by sort_order, name",
        );
        return rows.map(toCategoryDetail);
      }),

    updateCategory: (actor, slug, input) =>
      as(actor, async (q) => {
        const rows = await q.query<CategoryDetailRow>(
          `update public.categories
             set description = nullif($2, ''), image_url = nullif($3, ''), image_alt = case when nullif($3, '') is null then null else nullif($4, '') end
           where slug = $1
           returning slug, name, description, image_url, image_alt`,
          [slug, input.description ?? "", input.imageUrl ?? "", input.imageAlt ?? ""],
        );
        return rows[0] ? toCategoryDetail(rows[0]) : null;
      }),
  };
}

/** Slugs are globally unique, but a writer can't see other people's drafts. Ask the DB directly. */
async function slugExistsAnywhere(q: Queryable, slug: string): Promise<boolean> {
  const rows = await q.query<{ taken: boolean }>("select public.slug_taken($1) as taken", [slug]);
  return rows[0]?.taken ?? false;
}

interface CategoryDetailRow {
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
}

function toCategoryDetail(r: CategoryDetailRow): Category {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description,
    image: r.image_url ? { url: r.image_url, alt: r.image_alt ?? "" } : null,
  };
}
