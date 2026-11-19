import { useState } from "react";
import { data, useFetcher } from "react-router";
import type { Category } from "@coingist/types";
import type { Route } from "./+types/app.admin.site-images";
import { ImageField } from "~/components/ImageField";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Site images | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { categories } = await studioApi(auth).get<{ categories: Category[] }>("/v1/admin/categories");
  return data({ categories }, { headers: auth.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request);
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const r = await studioApi(auth).patch<{ category: Category }>(`/v1/admin/categories/${encodeURIComponent(slug)}`, {
    description: String(form.get("description") ?? ""),
    imageUrl: String(form.get("imageUrl") ?? ""),
    imageAlt: String(form.get("imageAlt") ?? ""),
  });
  if (!r.ok) return data({ slug, ok: false as const, message: r.message }, { status: r.status, headers: auth.headers });
  return data({ slug, ok: true as const, message: "Saved. The site shows it within a few minutes." }, { headers: auth.headers });
}

export default function SiteImages({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="font-display text-3xl font-extrabold">Site images</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Cover images for each topic. They appear on the home page topic tiles and at the top of each topic page.
          Stories have their own hero images, set in the story editor.
        </p>
      </header>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loaderData.categories.map((c) => (
          <CategoryCard key={c.slug} category={c} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const save = useFetcher<{ slug: string; ok: boolean; message: string }>();
  const [image, setImage] = useState({ url: category.image?.url ?? "", alt: category.image?.alt ?? "" });
  const [description, setDescription] = useState(category.description ?? "");
  const busy = save.state !== "idle";
  return (
    <save.Form method="post" className="panel space-y-3">
      <input type="hidden" name="slug" value={category.slug} />
      <input type="hidden" name="imageUrl" value={image.url} />
      <input type="hidden" name="imageAlt" value={image.alt} />
      <h2 className="font-display text-xl font-extrabold">{category.name}</h2>
      <ImageField label="Cover image" url={image.url} alt={image.alt} onChange={setImage} hint="Wide image, at least 1200px. Keep the subject centred." />
      <div>
        <label htmlFor={`desc-${category.slug}`} className="label">Short description</label>
        <textarea id={`desc-${category.slug}`} name="description" rows={2} maxLength={300} className="field"
          value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {save.data ? (
          <p role={save.data.ok ? "status" : "alert"} className={`text-sm ${save.data.ok ? "text-muted" : "text-bad"}`}>{save.data.message}</p>
        ) : null}
      </div>
    </save.Form>
  );
}
