import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { signOutHeaders } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/csrf.server";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  return redirect("/login", { headers: await signOutHeaders(request) });
}

export function loader() {
  return redirect("/");
}
