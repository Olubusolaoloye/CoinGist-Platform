import { redirect } from "react-router";
import type { Route } from "./+types/account.callback";
import { privateHeaders } from "~/lib/private.server";
import { readerAuthMode, safeNext, signedInHeaders, supabaseFor } from "~/lib/reader.server";

/** Supabase sends readers here after a magic link or Google sign-in (PKCE code exchange). */
export async function loader({ request }: Route.LoaderArgs) {
  if (readerAuthMode() !== "supabase") throw redirect("/account/login");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (!code) throw redirect("/account/login?error=1");
  const { client, headers } = supabaseFor(request);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw redirect(`/account/login?error=1&next=${encodeURIComponent(next)}`, { headers: privateHeaders(headers) });
  throw redirect(next, { headers: privateHeaders(signedInHeaders(headers)) });
}
