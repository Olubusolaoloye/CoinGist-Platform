import {
  slugify,
  type ListingCategory,
  type ListingInput,
  type ListingKind,
  type ListingScope,
  type Paginated,
  type PublicListing,
  type StudioListing,
} from "@coingist/types";
import type { Database, Queryable, SessionClaims } from "./database.js";
import { DomainError, mapDbError } from "./errors.js";

export interface ListingsRepository {
  /** Published events (upcoming/past) or opportunities (open/closed), for anyone. */
  list(kind: ListingKind, q: { scope: ListingScope; category?: ListingCategory | undefined; page: number; pageSize: number }): Promise<Paginated<PublicListing>>;
  get(kind: ListingKind, slug: string): Promise<PublicListing | null>;
  /** Every published event/opportunity slug, for the sitemap. */
  sitemap(): Promise<Array<{ kind: ListingKind; slug: string; updatedAt: string }>>;
  /** Studio: all listings staff can see (drafts included). */
  studioList(actor: SessionClaims, kind?: ListingKind): Promise<StudioListing[]>;
  studioGet(actor: SessionClaims, id: string): Promise<StudioListing | null>;
  create(actor: SessionClaims, input: ListingInput): Promise<StudioListing>;
  update(actor: SessionClaims, id: string, input: ListingInput): Promise<StudioListing>;
  remove(actor: SessionClaims, id: string): Promise<void>;
}

type Row = {
  id: string; kind: ListingKind; category: ListingCategory; title: string; slug: string; summary: string; details: string;
  url: string; image_url: string | null; image_alt: string | null; organizer: string | null; starts_at: Date | null;
  ends_at: Date | null; location: string | null; is_online: boolean; reward: string | null; status: "draft" | "published";
  safety_checked: boolean; checked_at: Date | null; created_by: string | null; published_at: Date | null; updated_at: Date;
  total?: number;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function toPublic(r: Row): PublicListing {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    title: r.title,
    slug: r.slug,
    summary: r.summary,
    details: r.details,
    url: r.url,
    image: r.image_url ? { url: r.image_url, alt: r.image_alt ?? "" } : null,
    organizer: r.organizer,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    location: r.location,
    isOnline: r.is_online,
    reward: r.reward,
    checkedAt: iso(r.checked_at),
    publishedAt: iso(r.published_at),
    updatedAt: iso(r.updated_at)!,
  };
}
const toStudio = (r: Row): StudioListing => ({ ...toPublic(r), status: r.status, safetyChecked: r.safety_checked, createdBy: r.created_by });

const SCOPES: Record<ListingScope, { kind: ListingKind; where: string; order: string }> = {
  upcoming: { kind: "event", where: "coalesce(ends_at, starts_at) >= now()", order: "starts_at asc" },
  past: { kind: "event", where: "coalesce(ends_at, starts_at) < now()", order: "starts_at desc" },
  open: { kind: "opportunity", where: "(ends_at is null or ends_at >= now())", order: "published_at desc" },
  closed: { kind: "opportunity", where: "ends_at < now()", order: "ends_at desc" },
};

export function createListingsRepository(db: Database): ListingsRepository {
  const run = <T>(actor: SessionClaims | null, fn: (q: Queryable) => Promise<T>) => db.asUser(actor, fn).catch(mapDbError);

  const uniqueSlug = async (q: Queryable, kind: ListingKind, title: string, exceptId?: string) => {
    const base = slugify(title) || kind;
    let slug = base;
    for (let n = 2; ; n++) {
      const taken = await q.query("select 1 from public.listings where kind = $1 and slug = $2 and id is distinct from $3", [kind, slug, exceptId ?? null]);
      if (!taken.length) return slug;
      slug = `${base}-${n}`;
    }
  };

  const values = (i: ListingInput) => [
    i.kind, i.category, i.title, i.summary, i.details, i.url, i.imageUrl, i.imageUrl ? i.imageAlt : null, i.organizer,
    i.startsAt, i.endsAt, i.location, i.isOnline, i.reward, i.status, i.kind === "opportunity" ? i.safetyChecked : false,
  ];

  return {
    list: (kind, { scope, category, page, pageSize }) =>
      run(null, async (q) => {
        const s = SCOPES[scope];
        if (s.kind !== kind) throw new DomainError("invalid", `Scope ${scope} doesn't apply to ${kind}s`);
        const rows = await q.query<Row>(
          `select *, count(*) over ()::int as total from public.listings
           where kind = $1 and status = 'published' and ${s.where} and ($2::text is null or category = $2)
           order by ${s.order} limit $3 offset $4`,
          [kind, category ?? null, pageSize, (page - 1) * pageSize],
        );
        return { items: rows.map(toPublic), page, pageSize, total: rows[0]?.total ?? 0 };
      }),

    get: (kind, slug) =>
      run(null, async (q) => {
        const rows = await q.query<Row>("select * from public.listings where kind = $1 and slug = $2 and status = 'published'", [kind, slug]);
        return rows[0] ? toPublic(rows[0]) : null;
      }),

    sitemap: () =>
      run(null, async (q) =>
        (await q.query<{ kind: ListingKind; slug: string; updated_at: Date }>(
          "select kind, slug, updated_at from public.listings where status = 'published' order by updated_at desc limit 5000",
        )).map((r) => ({ kind: r.kind, slug: r.slug, updatedAt: iso(r.updated_at)! })),
      ),

    studioList: (actor, kind) =>
      run(actor, async (q) =>
        (await q.query<Row>(
          `select * from public.listings where ($1::text is null or kind = $1)
           order by (status = 'draft') desc, coalesce(starts_at, ends_at, created_at) desc limit 500`,
          [kind ?? null],
        )).map(toStudio),
      ),

    studioGet: (actor, id) =>
      run(actor, async (q) => {
        const rows = await q.query<Row>("select * from public.listings where id = $1", [id]);
        return rows[0] ? toStudio(rows[0]) : null;
      }),

    create: (actor, input) =>
      run(actor, async (q) => {
        const slug = await uniqueSlug(q, input.kind, input.title);
        const rows = await q.query<Row>(
          `insert into public.listings (kind, category, title, summary, details, url, image_url, image_alt, organizer,
             starts_at, ends_at, location, is_online, reward, status, safety_checked, slug, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
          [...values(input), slug, actor.sub],
        );
        return toStudio(rows[0]!);
      }),

    update: (actor, id, input) =>
      run(actor, async (q) => {
        const current = await q.query<{ kind: ListingKind; title: string; slug: string; status: string }>(
          "select kind, title, slug, status from public.listings where id = $1",
          [id],
        );
        const row = current[0];
        if (!row) throw new DomainError("not_found", "Not found");
        if (row.kind !== input.kind) throw new DomainError("invalid", "An event can't become an opportunity, or the other way round");
        // Keep the published address stable; drafts follow their title.
        const slug = row.status === "published" ? row.slug : await uniqueSlug(q, input.kind, input.title, id);
        const rows = await q.query<Row>(
          `update public.listings set kind = $1, category = $2, title = $3, summary = $4, details = $5, url = $6, image_url = $7,
             image_alt = $8, organizer = $9, starts_at = $10, ends_at = $11, location = $12, is_online = $13, reward = $14,
             status = $15, safety_checked = $16, slug = $17
           where id = $18 returning *`,
          [...values(input), slug, id],
        );
        if (!rows[0]) throw new DomainError("not_found", "Not found");
        return toStudio(rows[0]);
      }),

    remove: (actor, id) =>
      run(actor, async (q) => {
        const rows = await q.query("delete from public.listings where id = $1 returning id", [id]);
        if (!rows.length) throw new DomainError("not_found", "Not found");
      }),
  };
}
