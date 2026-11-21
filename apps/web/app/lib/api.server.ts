import { data } from "react-router";
import type {
  AuthorProfile,
  Category,
  Paginated,
  PostDetail,
  PostSummary,
  PostType,
  PriceTicker,
  PublicAdSlot,
  SitemapData,
  TagRef, StoryEngagement } from "@coingist/types";
import { apiUrl } from "./config.server";

/**
 * Calls the API. Preview deploys (DEMO_INPROCESS_API=true) run the demo API inside this server
 * instead, so one cold start builds one sample database rather than one per parallel request.
 */
async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  if (process.env["DEMO_INPROCESS_API"] === "true") {
    const { demoApiFetch } = await import("./demo-api.server");
    return demoApiFetch(new Request(`http://demo.internal${path}`, init));
  }
  return fetch(`${apiUrl()}${path}`, init);
}

/** Thrown into the route ErrorBoundary as a proper HTTP response. */
function notFound(): never {
  throw data(null, { status: 404 });
}

async function get<T>(path: string, opts: { allow404?: boolean } = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await apiFetch(`/v1/public${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`API unreachable: ${path}`, err);
    throw data(null, { status: 503 });
  }
  if (res.status === 404 && opts.allow404) return null;
  if (res.status === 400 || res.status === 404) notFound();
  if (!res.ok) {
    console.error(`API ${res.status}: ${path}`);
    throw data(null, { status: 502 });
  }
  return (await res.json()) as T;
}

export interface ListParams {
  type?: PostType;
  category?: string;
  tag?: string;
  author?: string;
  exclude?: string;
  featured?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const api = {
  async listPosts(params: ListParams = {}): Promise<Paginated<PostSummary>> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    return (await get<Paginated<PostSummary>>(`/posts?${qs}`))!;
  },
  async getPost(slug: string): Promise<PostDetail> {
    return (await get<{ post: PostDetail }>(`/posts/${encodeURIComponent(slug)}`))!.post;
  },
  async listCategories(): Promise<Category[]> {
    return (await get<{ categories: Category[] }>("/categories"))!.categories;
  },
  async getCategory(slug: string): Promise<Category> {
    return (await get<{ category: Category }>(`/categories/${encodeURIComponent(slug)}`))!.category;
  },
  async getTag(slug: string): Promise<TagRef> {
    return (await get<{ tag: TagRef }>(`/tags/${encodeURIComponent(slug)}`))!.tag;
  },
  /** Ads never break a page: on any error, render the slots empty. */
  async ads(placement: "home" | "article"): Promise<PublicAdSlot[]> {
    try {
      return (await get<{ slots: PublicAdSlot[] }>(`/ads?placement=${placement}`))!.slots;
    } catch {
      return [];
    }
  },
  /** A story's likes and comments (never cached: they change constantly). */
  async engagement(postId: string): Promise<StoryEngagement> {
    try {
      const res = await apiFetch(`/v1/public/posts/${encodeURIComponent(postId)}/engagement`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return (await res.json()) as StoryEngagement;
    } catch {
      // fall through: show an empty thread rather than break the page
    }
    return { likes: 0, comments: [] };
  },
  async recordAdClick(id: string): Promise<string | null> {
    try {
      const res = await apiFetch(`/v1/public/ads/${encodeURIComponent(id)}/click`, {
        method: "POST",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? ((await res.json()) as { url: string }).url : null;
    } catch {
      return null;
    }
  },
  async sitemap(): Promise<SitemapData> {
    return (await get<SitemapData>("/sitemap"))!;
  },
  /** The price ticker never breaks a page: on any error (or no source), there's no strip. */
  async prices(): Promise<PriceTicker | null> {
    try {
      const res = await apiFetch("/v1/public/prices", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3000) });
      return res.ok ? ((await res.json()) as PriceTicker) : null;
    } catch {
      return null;
    }
  },
  async getAuthor(slug: string): Promise<AuthorProfile> {
    return (await get<{ author: AuthorProfile }>(`/authors/${encodeURIComponent(slug)}`))!.author;
  },
};

/** Parse ?page=N. Invalid or < 1 is a 404 so crawlers don't index junk URLs. */
export function pageParam(request: Request): number {
  const raw = new URL(request.url).searchParams.get("page");
  if (raw === null) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1000) notFound();
  return n;
}

/** 404 when a page number is beyond the last page. */
export function assertPageInRange(page: number, list: Paginated<unknown>) {
  if (page > 1 && (page - 1) * list.pageSize >= list.total) notFound();
}

export const HTML_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

/**
 * Netlify's shared ("durable") cache, which every edge node reads, unlike the per-node edge
 * cache. Pages refresh at most once a minute; when one has expired, readers get the cached copy
 * instantly while Netlify re-renders it in the background (for up to a week).
 */
export const CDN_HEADERS = {
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=60, stale-while-revalidate=604800",
  // The theme cookie changes the HTML (light/dark class), so cache each variant separately.
  "Netlify-Vary": "query,cookie=theme",
} as const;

/** Loader response that the CDN may cache. Errors are thrown, so they never get these headers. */
export function cached<T>(value: T) {
  return data(value, { headers: { "Cache-Control": HTML_CACHE, ...CDN_HEADERS } });
}

export type SubscribeResult = { ok: true; message: string } | { ok: false; message: string };

/** Newsletter signup. Returns a message for the reader either way; never throws for user errors. */
export async function subscribeToNewsletter(body: {
  email: string;
  lists: string[];
  source: string;
  website: string;
}): Promise<SubscribeResult> {
  try {
    const res = await apiFetch(`/v1/public/newsletter/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
    if (res.ok) return { ok: true, message: json.message ?? "Check your inbox to confirm your subscription." };
    if (res.status === 400) return { ok: false, message: json.error?.message ?? "Check your email address and try again." };
    return { ok: false, message: "We couldn't sign you up just now. Try again in a minute." };
  } catch {
    return { ok: false, message: "We couldn't sign you up just now. Try again in a minute." };
  }
}
