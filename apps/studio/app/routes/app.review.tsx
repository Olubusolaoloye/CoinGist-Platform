import { data, Link } from "react-router";
import type { StudioPostSummary } from "@coingist/types";
import type { Route } from "./+types/app.review";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { formatWhen } from "~/lib/format";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "Review queue | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { posts } = await studioApi(auth).get<{ posts: StudioPostSummary[] }>("/v1/studio/review-queue");
  return data({ posts }, { headers: auth.headers });
}

export default function Review({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData;
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Review queue</h1>
      <p className="mt-1 text-muted">Stories waiting for an editor, oldest first. Your own submissions go to another editor.</p>
      {posts.length === 0 ? (
        <p className="mt-8 panel">Nothing to review. New submissions will appear here.</p>
      ) : (
        <ol className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <Link to={`/posts/${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
              <span className="text-sm text-muted capitalize">{p.type}</span>
              <span className="text-sm text-muted">by {p.author.name ?? "Unknown"}</span>
              <span className="ml-auto text-sm text-muted">Submitted {formatWhen(p.updatedAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
