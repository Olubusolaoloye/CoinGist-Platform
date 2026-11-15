import { redirect } from "react-router";
import type { Route } from "./+types/auth.callback";
import { safeNext } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { supabaseForRequest } from "~/lib/supabase.server";

/** Supabase redirects here after a magic link or Google sign-in (PKCE code exchange). */
export async function loader({ request }: Route.LoaderArgs) {
  if (env.authMode !== "supabase") throw redirect("/login");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (!code) throw redirect("/login?error=1");

  const { client, headers } = supabaseForRequest(request);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw redirect("/login?error=1", { headers });
  // Staff must complete TOTP before Studio grants anything.
  throw redirect(`/mfa?next=${encodeURIComponent(next)}`, { headers });
}
