import { redirect } from "react-router";
import type { Route } from "./+types/account.logout";
import { privateHeaders } from "~/lib/private.server";
import { assertSameOrigin, signOut } from "~/lib/reader.server";

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  throw redirect("/", { headers: privateHeaders(await signOut(request)) });
}

export function loader() {
  throw redirect("/account");
}
