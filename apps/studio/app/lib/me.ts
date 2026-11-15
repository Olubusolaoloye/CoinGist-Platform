import { useRouteLoaderData } from "react-router";
import type { Me } from "./api.server";

/** The signed-in user, loaded once by the app layout. */
export function useMe(): Me {
  const data = useRouteLoaderData<{ me: Me }>("routes/app");
  if (!data) throw new Error("useMe must be used inside the app layout");
  return data.me;
}
