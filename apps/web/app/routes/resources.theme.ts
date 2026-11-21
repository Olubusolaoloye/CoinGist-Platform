import { readForm } from "~/lib/form.server";
import { data, redirect } from "react-router";
import type { Route } from "./+types/resources.theme";
import { themeCookie } from "~/lib/theme.server";

export async function action({ request }: Route.ActionArgs) {
  const form = await readForm(request);
  const raw = form.get("theme");
  const theme = raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  if (!theme) return data({ ok: false }, { status: 400 });

  const cookie = themeCookie(theme, new URL(request.url).protocol === "https:");
  const back = form.get("redirectTo");
  // No-JS form post: send them back where they were (same-site paths only).
  if (typeof back === "string" && back.startsWith("/") && !back.startsWith("//")) {
    return redirect(back, { headers: { "Set-Cookie": cookie } });
  }
  return data({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

export function loader() {
  throw data(null, { status: 404 });
}
