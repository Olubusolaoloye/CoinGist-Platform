import { useEffect } from "react";
import { redirect, useSubmit } from "react-router";
import type { Route } from "./+types/auth.callback";
import { Wordmark } from "~/components/Wordmark";
import { safeNext } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { readForm } from "~/lib/form.server";
import { supabaseForRequest } from "~/lib/supabase.server";

export function meta() {
  return [{ title: "Signing you in | CoinGist Studio" }];
}

/**
 * Supabase redirects here after sign-in.
 * - Magic link or Google from the login page: `?code=` (PKCE), exchanged here on the server.
 * - Invite emails: the tokens arrive in the URL fragment, which only the browser sees, so the
 *   page posts them back and the action turns them into a session (Supabase checks them).
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (env.authMode !== "supabase") throw redirect("/login");
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (url.searchParams.get("error")) throw redirect("/login?error=1");
  const code = url.searchParams.get("code");
  if (!code) return { next };

  const { client, headers } = supabaseForRequest(request);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw redirect("/login?error=1", { headers });
  // Staff must complete TOTP before Studio grants anything.
  throw redirect(`/mfa?next=${encodeURIComponent(next)}`, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  if (env.authMode !== "supabase") throw redirect("/login");
  const form = await readForm(request);
  const next = safeNext(String(form.get("next") ?? ""));
  const access_token = String(form.get("access_token") ?? "");
  const refresh_token = String(form.get("refresh_token") ?? "");
  if (!access_token || !refresh_token) throw redirect("/login?error=1");
  const { client, headers } = supabaseForRequest(request);
  const { error } = await client.auth.setSession({ access_token, refresh_token });
  if (error) throw redirect("/login?error=1", { headers });
  throw redirect(`/mfa?next=${encodeURIComponent(next)}`, { headers });
}

export default function AuthCallback({ loaderData }: Route.ComponentProps) {
  const submit = useSubmit();
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Drop the tokens from the address bar and history straight away.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) {
      window.location.replace("/login?error=1");
      return;
    }
    submit({ access_token, refresh_token, next: loaderData.next }, { method: "post", replace: true });
  }, [submit, loaderData.next]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <Wordmark />
      <p role="status" className="mt-6 text-lg">Signing you in…</p>
    </main>
  );
}
