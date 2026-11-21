import { data, Link, redirect } from "react-router";
import type { StaffAuthor } from "@coingist/types";
import type { Route } from "./+types/app.authors";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;
export function meta() {
  return [{ title: "Authors | CoinGist Studio" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const api = studioApi(auth);
  const [{ authors }, me] = await Promise.all([api.get<{ authors: StaffAuthor[] }>("/v1/studio/authors"), api.me()]);
  // Writers only manage their own profile: send them straight to it.
  if (me.user.role === "writer") throw redirect(`/authors/${me.user.id}`, { headers: auth.headers });
  return data({ authors, meId: me.user.id, siteUrl: env.siteUrl }, { headers: auth.headers });
}

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export default function Authors({ loaderData }: Route.ComponentProps) {
  const { authors, meId, siteUrl } = loaderData;
  return (
    <main className="space-y-6 px-3 py-6 sm:px-5">
      <header>
        <p className="eyebrow">Newsroom</p>
        <h1 className="font-display text-3xl font-extrabold">Authors</h1>
        <p className="mt-1 max-w-2xl text-muted">
          The names, photos and bios readers see on bylines and author pages. Everyone can edit their own; editors can edit anyone&rsquo;s
          and choose who a story is credited to from the story&rsquo;s Status panel. New team members are added on Team and roles.
        </p>
      </header>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {authors.map((a) => {
          const name = a.name ?? a.email;
          const missing = [!a.name && "name", !a.avatarUrl && "photo", !a.bio && "bio"].filter(Boolean) as string[];
          return (
            <li key={a.id} className="panel flex gap-4">
              {a.avatarUrl ? (
                <img src={a.avatarUrl.startsWith("/") ? `${siteUrl}${a.avatarUrl}` : a.avatarUrl} alt="" className="size-16 shrink-0 rounded-full object-cover" />
              ) : (
                <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-gist text-lg font-bold text-gist-ink">{initials(name)}</span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-lg font-extrabold">{name}{a.id === meId ? " (you)" : ""}</h2>
                <p className="text-sm text-muted">{a.title ?? <span className="capitalize">{a.role}</span>}</p>
                {missing.length ? (
                  <p className="mt-1 text-sm text-warn">Missing: {missing.join(", ")}</p>
                ) : (
                  <p className="mt-1 text-sm text-ok">Profile complete</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Link to={`/authors/${a.id}`} className="font-semibold text-link hover:underline" aria-label={`Edit ${name}'s profile`}>Edit profile</Link>
                  {a.slug ? (
                    <a href={`${siteUrl}/author/${a.slug}`} target="_blank" rel="noopener noreferrer" className="text-muted hover:underline">
                      Author page<span className="sr-only"> for {name} (opens in a new tab)</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
