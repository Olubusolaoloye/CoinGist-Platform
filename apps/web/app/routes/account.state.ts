import { data } from "react-router";
import type { Route } from "./+types/account.state";
import { privateHeaders } from "~/lib/private.server";
import { getReader, readerApi, signOut, SignedOut } from "~/lib/reader.server";

const UUID = /^[0-9a-f-]{36}$/i;

/** The reader's saved/followed state for a page's buttons (loaded by the browser, never cached). */
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await getReader(request);
  if (!auth) return data({ signedIn: false as const }, { headers: privateHeaders() });
  const postId = new URL(request.url).searchParams.get("postId");
  try {
    const state = await readerApi(auth).state(postId && UUID.test(postId) ? postId : undefined);
    return data({ signedIn: true as const, ...state }, { headers: privateHeaders(auth.headers) });
  } catch (err) {
    if (err instanceof SignedOut) return data({ signedIn: false as const }, { headers: privateHeaders(await signOut(request)) });
    throw err;
  }
}
