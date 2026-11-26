import { data, Form, redirect, useNavigation } from "react-router";
import { POST_TYPES, type StudioPost } from "@coingist/types";
import type { Route } from "./+types/app.posts.new";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;

export function meta() {
  return [{ title: "New story | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  // A suggested headline (e.g. from the trending digest) pre-fills the form; you still edit and confirm it.
  const title = (new URL(request.url).searchParams.get("title") ?? "").slice(0, 300);
  return { title };
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const form = await request.formData();
  const res = await studioApi(auth).post<{ post: StudioPost }>("/v1/studio/posts", {
    title: String(form.get("title") ?? ""),
    type: String(form.get("type") ?? "news"),
  });
  if (!res.ok) return data({ error: res.message }, { status: res.status, headers: auth.headers });
  return redirect(`/posts/${res.data.post.id}`, { headers: auth.headers });
}

const TYPE_HELP: Record<string, string> = {
  news: "Reported story on something that happened.",
  gist: "Short take: the story in a few lines.",
  learn: "Evergreen guide or explainer.",
  sponsored: "Paid content. Always labelled as sponsored.",
};

export default function NewPost({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold">New story</h1>
      <Form method="post" className="mt-6 space-y-5">
        <div>
          <label htmlFor="title" className="label">Headline</label>
          <input id="title" name="title" required maxLength={300} className="field text-lg" autoFocus defaultValue={loaderData.title} />
          <p className="hint">You can change it later. The URL slug is made from it.</p>
        </div>
        <fieldset>
          <legend className="label">Section</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {POST_TYPES.map((t, i) => (
              <label key={t} className="flex cursor-pointer gap-3 rounded-md border border-line bg-surface p-3 has-[:checked]:border-ink">
                <input type="radio" name="type" value={t} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="block font-semibold capitalize">{t}</span>
                  <span className="text-sm text-muted">{TYPE_HELP[t]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {actionData && "error" in actionData ? <p role="alert" className="text-sm text-bad">{actionData.error}</p> : null}
        <button className="btn btn-primary" disabled={busy}>Create draft</button>
      </Form>
    </main>
  );
}
