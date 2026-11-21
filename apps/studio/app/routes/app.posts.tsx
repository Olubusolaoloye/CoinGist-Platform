import { data, Link, useSearchParams } from "react-router";
import { hasAtLeast, POST_STATUSES, type Paginated, type StudioPostSummary } from "@coingist/types";
import type { Route } from "./+types/app.posts";
import { StatusBadge } from "~/components/StatusBadge";
import { StoryBoard } from "~/components/StoryBoard";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";
import { useMe } from "~/lib/me";
import { STATUS_LABEL } from "~/lib/workflow";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Posts | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  const status = url.searchParams.get("status");
  if (status && (POST_STATUSES as readonly string[]).includes(status)) qs.set("status", status);
  if (url.searchParams.get("view") !== "all") qs.set("mine", "true");
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  if (q) qs.set("q", q);
  const board = url.searchParams.get("layout") !== "list";
  const page = board ? 1 : Math.max(1, Number(url.searchParams.get("page")) || 1);
  qs.set("page", String(page));
  if (board) qs.set("pageSize", "100");
  const list = await studioApi(auth).get<Paginated<StudioPostSummary>>(`/v1/studio/posts?${qs}`);
  return data({ list }, { headers: auth.headers });
}

export default function Posts({ loaderData }: Route.ComponentProps) {
  const { list } = loaderData;
  const me = useMe();
  const [params] = useSearchParams();
  const view = params.get("view") === "all" ? "all" : "mine";
  const board = params.get("layout") !== "list";
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
    return `?${next}`;
  };
  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-night bg-night text-white" : "glass border-line text-muted hover:text-ink"}`;
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <main className="px-3 py-6 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Stories</h1>
          {q ? <p className="mt-1 text-muted">Showing stories matching “{q}”. <Link to={link({ q: null })} className="font-semibold text-link underline">Clear search</Link></p> : null}
        </div>
        <div className="glass flex rounded-full p-1" role="group" aria-label="Layout">
          <Link to={link({ layout: null })} aria-current={board ? "true" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${board ? "bg-night text-white" : "text-muted hover:text-ink"}`}>Board</Link>
          <Link to={link({ layout: "list" })} aria-current={!board ? "true" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!board ? "bg-night text-white" : "text-muted hover:text-ink"}`}>List</Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Link to={link({ view: null })} className={pill(view === "mine")} aria-current={view === "mine" ? "true" : undefined}>My posts</Link>
        <Link to={link({ view: "all" })} className={pill(view === "all")} aria-current={view === "all" ? "true" : undefined}>
          {hasAtLeast(me.user.role, "editor") ? "Everyone's posts" : "Mine and published"}
        </Link>
        {!board ? <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" /> : null}
        {!board ? (
          <>
            <Link to={link({ status: null })} className={pill(status === "")}>Any status</Link>
            {POST_STATUSES.map((s) => (
              <Link key={s} to={link({ status: s })} className={pill(status === s)}>{STATUS_LABEL[s]}</Link>
            ))}
          </>
        ) : null}
      </div>

      {board ? (
        <div className="mt-5"><StoryBoard posts={status ? list.items.filter((p) => p.status === status) : list.items} /></div>
      ) : list.items.length === 0 ? (
        <div className="mt-10 panel text-center">
          <p className="text-lg">No posts match these filters.</p>
          <Link to="/posts/new" className="btn btn-primary mt-4">Start a new post</Link>
        </div>
      ) : (
        <div className="glass mt-6 overflow-x-auto rounded-3xl">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Title</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Section</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Author</th>
                <th scope="col" className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.items.map((p) => (
                <tr key={p.id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link to={`/posts/${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
                    {p.openComments > 0 ? (
                      <span className="ml-2 text-xs text-warn">{p.openComments} open comment{p.openComments === 1 ? "" : "s"}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="hidden px-4 py-3 capitalize md:table-cell">{p.type}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{p.author.name ?? "Unknown"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!board && lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          {list.page > 1 ? <Link className="btn" to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(list.page - 1) })}`}>Previous</Link> : <span />}
          <span className="text-sm text-muted">Page {list.page} of {lastPage}</span>
          {list.page < lastPage ? <Link className="btn" to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(list.page + 1) })}`}>Next</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
