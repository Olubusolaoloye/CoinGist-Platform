import { createClient } from "@supabase/supabase-js";
import { env } from "./env.server";

export type InviteEmailResult = { sent: true } | { sent: false; reason: "dev" | "rate_limited" | "failed" };

/**
 * Sends the invited person a sign-in email (Supabase's magic link), creating their account when
 * they click it. The role comes from the invite recorded in the database, never from this email.
 *
 * A separate client that keeps no session: sending must not touch the admin's own sign-in. It uses
 * the implicit flow, because the link is opened in the invitee's browser, which has no PKCE
 * verifier; /auth/callback picks the tokens up from the link.
 */
export async function sendInviteEmail(email: string): Promise<InviteEmailResult> {
  if (env.authMode !== "supabase") return { sent: false, reason: "dev" };
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${env.studioUrl}/auth/callback?next=${encodeURIComponent("/posts")}` },
  });
  if (!error) return { sent: true };
  return { sent: false, reason: error.status === 429 ? "rate_limited" : "failed" };
}
