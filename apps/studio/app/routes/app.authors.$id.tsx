import { data, Link } from "react-router";
import type { StaffAuthor } from "@coingist/types";
import type { Route } from "./+types/app.authors.$id";
import { AuthorForm, authorBody, type AuthorSaveResult } from "~/components/AuthorForm";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.self ? "My author profile" : "Edit author"} | CoinGist Studio` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const [{ authors }, me] = await Promise.all([api.get<{ authors: StaffAuthor[] }>("/v1/studio/authors"), api.me()]);
  // The list only includes people you may edit (writers: just yourself).
  const author = authors.find((a) => a.id === params.id);
  if (!author) throw data({ error: "Not found" }, { status: 404 });
  return data({ author, self: author.id === me.user.id, canSeeAll: me.user.role !== "writer", siteUrl: env.siteUrl }, { headers: auth.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const r = await studioApi(auth).put<{ slug: string }>(`/v1/studio/authors/${params.id}`, authorBody(await request.formData()));
  if (!r.ok) return data<AuthorSaveResult>({ ok: false, message: r.message }, { status: r.status, headers: auth.headers });
  return data<AuthorSaveResult>({ ok: true, message: "Saved. Bylines and the author page update within a few minutes." }, { headers: auth.headers });
}

export default function EditAuthor({ loaderData }: Route.ComponentProps) {
  const { author, self, canSeeAll, siteUrl } = loaderData;
  return (
    <main className="space-y-6 px-3 py-6 sm:px-5">
      <header>
        {canSeeAll ? <p className="text-sm"><Link to="/authors" className="text-link hover:underline">Authors</Link> /</p> : <p className="eyebrow">Your profile</p>}
        <h1 className="font-display text-3xl font-extrabold">{self ? "My author profile" : author.name ?? author.email}</h1>
        <p className="mt-1 max-w-2xl text-muted">
          {self ? "How readers see you" : "How readers see this author"}: on story bylines and the author page. {author.email} · <span className="capitalize">{author.role}</span>
        </p>
      </header>
      <section className="panel">
        <AuthorForm author={author} siteUrl={siteUrl} self={self} />
      </section>
    </main>
  );
}
