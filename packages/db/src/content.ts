import { MIN_INDEXABLE_TAG_POSTS } from "@coingist/types";
import type {
  AuthorProfile,
  Category,
  Paginated,
  PostDetail,
  PostSummary,
  PostType,
  RichTextDoc,
  SitemapData,
  TagRef,
} from "@coingist/types";
import type { Database, Queryable } from "./database.js";
import { mapDbError } from "./errors.js";

export interface ListPostsQuery {
  type?: PostType | undefined;
  categorySlug?: string | undefined;
  tagSlug?: string | undefined;
  authorSlug?: string | undefined;
  excludeId?: string | undefined;
  /** Only stories editors have featured. */
  featured?: boolean | undefined;
  /** Full-text search; results ranked by relevance, then recency. */
  q?: string | undefined;
  page: number;
  pageSize: number;
}

/** Read-only public content. Every query runs as `anon`, so RLS only ever exposes live posts. */
export interface ContentRepository {
  listPosts(q: ListPostsQuery): Promise<Paginated<PostSummary>>;
  getPost(slug: string): Promise<PostDetail | null>;
  listCategories(): Promise<Category[]>;
  getCategory(slug: string): Promise<Category | null>;
  getTag(slug: string): Promise<TagRef | null>;
  getAuthor(slug: string): Promise<AuthorProfile | null>;
  /** All live posts and listing pages, for XML sitemaps (capped at Google's 50,000 URLs). */
  sitemap(): Promise<SitemapData>;
}

export type SummaryRow = {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  published_at: Date | string;
  updated_at: Date | string;
  is_sponsored: boolean;
  category_slug: string | null;
  category_name: string | null;
  author_slug: string | null;
  author_name: string | null;
  author_avatar: string | null;
  sponsor_name: string | null;
  read_minutes: number;
  total?: number;
};

type DetailRow = SummaryRow & {
  summary_bullets: string[];
  body_json: RichTextDoc;
  seo_title: string | null;
  seo_description: string | null;
  canonical: string | null;
  ai_assisted: boolean;
  sponsor_website: string | null;
  tags: TagRef[] | null;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

export const SUMMARY_SELECT = `
  p.id, p.type, p.slug, p.title, p.excerpt, p.hero_image_url, p.hero_image_alt,
  p.published_at, p.updated_at, p.is_sponsored,
  c.slug as category_slug, c.name as category_name,
  a.slug as author_slug, a.name as author_name, a.avatar_url as author_avatar,
  s.name as sponsor_name,
  greatest(1, round(coalesce(array_length(regexp_split_to_array(
    trim(jsonb_path_query_array(p.body_json, 'lax $.**.text')::text), '\s+'), 1), 0) / 220.0))::int as read_minutes`;

export const SUMMARY_FROM = `
  from public.posts p
  left join public.categories c on c.id = p.category_id
  left join public.author_directory a on a.user_id = p.author_id
  left join public.sponsor_directory s on s.id = p.sponsor_id`;

export function toSummary(r: SummaryRow): PostSummary {
  return {
    id: r.id,
    type: r.type,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    heroImage: r.hero_image_url ? { url: r.hero_image_url, alt: r.hero_image_alt ?? "" } : null,
    category: r.category_slug ? { slug: r.category_slug, name: r.category_name! } : null,
    author: r.author_slug
      ? { slug: r.author_slug, name: r.author_name ?? r.author_slug, avatarUrl: r.author_avatar }
      : null,
    publishedAt: iso(r.published_at),
    updatedAt: iso(r.updated_at),
    isSponsored: r.is_sponsored,
    sponsorName: r.sponsor_name,
    readMinutes: r.read_minutes,
  };
}

interface CategoryRow {
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
}

function toCategory(r: CategoryRow): Category {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description,
    image: r.image_url ? { url: r.image_url, alt: r.image_alt ?? "" } : null,
  };
}

export function createContentRepository(db: Database): ContentRepository {
  const anon = <T>(fn: (q: Queryable) => Promise<T>) => db.asUser(null, fn).catch(mapDbError);

  return {
    listPosts: (q) =>
      anon(async (sql) => {
        const search = q.q?.trim() ? q.q.trim().slice(0, 100) : null;
        const rows = await sql.query<SummaryRow>(
          `select ${SUMMARY_SELECT}, count(*) over ()::int as total
           ${SUMMARY_FROM}
           where p.status = 'published' and p.published_at <= now()
             and ($1::public.post_type is null or p.type = $1)
             and ($2::text is null or c.slug = $2)
             and ($3::text is null or a.slug = $3)
             and ($4::text is null or exists (
               select 1 from public.post_tags pt join public.tags t on t.id = pt.tag_id
               where pt.post_id = p.id and t.slug = $4))
             and ($5::uuid is null or p.id <> $5)
             and (not $8::boolean or p.featured)
             and ($9::text is null or p.search @@ websearch_to_tsquery('english', $9))
           order by
             case when $9::text is null then 0
                  else ts_rank(p.search, websearch_to_tsquery('english', $9)) end desc,
             p.published_at desc, p.id desc
           limit $6 offset $7`,
          [
            q.type ?? null,
            q.categorySlug ?? null,
            q.authorSlug ?? null,
            q.tagSlug ?? null,
            q.excludeId ?? null,
            q.pageSize,
            (q.page - 1) * q.pageSize,
            q.featured ?? false,
            search,
          ],
        );
        return {
          items: rows.map(toSummary),
          page: q.page,
          pageSize: q.pageSize,
          total: rows[0]?.total ?? 0,
        };
      }),

    getPost: (slug) =>
      anon(async (sql) => {
        const rows = await sql.query<DetailRow>(
          `select ${SUMMARY_SELECT},
             p.summary_bullets, p.body_json, p.seo_title, p.seo_description, p.canonical,
             p.ai_assisted, s.website as sponsor_website,
             (select coalesce(json_agg(json_build_object('slug', t.slug, 'name', t.name)
                       order by t.name), '[]'::json)
              from public.post_tags pt join public.tags t on t.id = pt.tag_id
              where pt.post_id = p.id) as tags
           ${SUMMARY_FROM}
           where p.slug = $1 and p.status = 'published' and p.published_at <= now()`,
          [slug],
        );
        const r = rows[0];
        if (!r) return null;
        return {
          ...toSummary(r),
          summaryBullets: r.summary_bullets,
          body: r.body_json,
          tags: r.tags ?? [],
          seoTitle: r.seo_title,
          seoDescription: r.seo_description,
          canonical: r.canonical,
          aiAssisted: r.ai_assisted,
          sponsor: r.sponsor_name ? { name: r.sponsor_name, website: r.sponsor_website } : null,
        };
      }),

    listCategories: () =>
      anon((sql) =>
        sql
          .query<CategoryRow>(
            `select slug, name, description, image_url, image_alt from public.categories
             where parent_id is null order by sort_order, name`,
          )
          .then((rows) => rows.map(toCategory)),
      ),

    getCategory: (slug) =>
      anon(async (sql) => {
        const rows = await sql.query<CategoryRow>(
          "select slug, name, description, image_url, image_alt from public.categories where slug = $1",
          [slug],
        );
        return rows[0] ? toCategory(rows[0]) : null;
      }),

    getTag: (slug) =>
      anon(async (sql) => {
        const rows = await sql.query<TagRef>("select slug, name from public.tags where slug = $1", [
          slug,
        ]);
        return rows[0] ?? null;
      }),

    sitemap: () =>
      anon(async (sql) => {
        const posts = await sql.query<{
          type: PostType; slug: string; title: string; published_at: Date; updated_at: Date;
          is_sponsored: boolean; tags: string[] | null;
        }>(
          `select p.type, p.slug, p.title, p.published_at, p.updated_at, p.is_sponsored,
             (select array_agg(t.name order by t.name) from public.post_tags pt
                join public.tags t on t.id = pt.tag_id where pt.post_id = p.id) as tags
           from public.posts p
           where p.status = 'published' and p.published_at <= now()
           order by p.published_at desc limit 50000`,
        );
        const categories = await sql.query<{ slug: string; last: Date | null }>(
          `select c.slug, max(p.published_at) as last from public.categories c
           left join public.posts p on p.category_id = c.id
             and p.status = 'published' and p.published_at <= now()
           group by c.slug order by c.slug`,
        );
        const authors = await sql.query<{ slug: string; last: Date | null }>(
          `select a.slug, max(p.published_at) as last from public.author_directory a
           left join public.posts p on p.author_id = a.user_id
             and p.status = 'published' and p.published_at <= now()
           group by a.slug order by a.slug`,
        );
        const tags = await sql.query<{ slug: string; last: Date }>(
          `select t.slug, max(p.published_at) as last from public.tags t
           join public.post_tags pt on pt.tag_id = t.id
           join public.posts p on p.id = pt.post_id
             and p.status = 'published' and p.published_at <= now()
           group by t.slug having count(*) >= $1 order by t.slug`,
          [MIN_INDEXABLE_TAG_POSTS],
        );
        const isoOrNull = (d: Date | null) => (d ? iso(d) : null);
        return {
          posts: posts.map((p) => ({
            type: p.type,
            slug: p.slug,
            title: p.title,
            publishedAt: iso(p.published_at),
            updatedAt: iso(p.updated_at),
            isSponsored: p.is_sponsored,
            tags: p.tags ?? [],
          })),
          categories: categories.map((c) => ({ slug: c.slug, lastPublishedAt: isoOrNull(c.last) })),
          authors: authors.map((a) => ({ slug: a.slug, lastPublishedAt: isoOrNull(a.last) })),
          tags: tags.map((t) => ({ slug: t.slug, lastPublishedAt: iso(t.last) })),
        };
      }),

    getAuthor: (slug) =>
      anon(async (sql) => {
        const rows = await sql.query<{
          slug: string;
          name: string | null;
          avatar_url: string | null;
          bio: string | null;
          socials: Record<string, string>;
          expertise: string[];
          title: string | null;
        }>(
          `select slug, name, avatar_url, bio, socials, expertise, title
           from public.author_directory where slug = $1`,
          [slug],
        );
        const r = rows[0];
        return r
          ? {
              slug: r.slug,
              name: r.name ?? r.slug,
              avatarUrl: r.avatar_url,
              title: r.title,
              bio: r.bio,
              socials: r.socials,
              expertise: r.expertise,
            }
          : null;
      }),
  };
}
