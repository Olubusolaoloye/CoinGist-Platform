import { redirect } from "react-router";
import { hasAtLeast } from "@coingist/types";
import type { Route } from "./+types/app.index";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";

/** Studio home: admins land on Admin, editors on their dashboard, writers on their posts. */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const { user } = await studioApi(auth).me();
  const to = user.role === "admin" ? "/admin" : hasAtLeast(user.role, "editor") ? "/dashboard" : "/posts";
  return redirect(to, { headers: auth.headers });
}
