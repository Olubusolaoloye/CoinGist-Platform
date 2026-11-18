import { data, Form, NavLink, Outlet } from "react-router";
import { can, hasAtLeast, isStaff } from "@coingist/types";
import type { Route } from "./+types/app";
import { Wordmark } from "~/components/Wordmark";
import { studioApi } from "~/lib/api.server";
import { requireAuth } from "~/lib/auth.server";
import { studioHeaders } from "~/lib/headers";

export const headers = studioHeaders;

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request);
  const me = await studioApi(auth).me();
  if (!isStaff(me.user.role)) {
    throw data(
      { error: "Studio is for CoinGist writers, editors and admins. Ask an admin to give your account a staff role." },
      { status: 403, headers: auth.headers },
    );
  }
  return data({ me }, { headers: auth.headers });
}

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-2 text-sm font-semibold hover:bg-line ${isActive ? "bg-line" : ""}`;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { me } = loaderData;
  const role = me.user.role;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <NavLink to="/" className="mr-2">
            <Wordmark />
          </NavLink>
          <nav aria-label="Studio" className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex flex-wrap gap-1">
              {role === "admin" ? <li><NavLink to="/admin" className={nav}>Admin</NavLink></li> : null}
              {hasAtLeast(role, "editor") ? <li><NavLink to="/dashboard" className={nav}>Dashboard</NavLink></li> : null}
              <li><NavLink to="/posts" end className={nav}>Posts</NavLink></li>
              {hasAtLeast(role, "editor") ? <li><NavLink to="/review" className={nav}>Review queue</NavLink></li> : null}
              {hasAtLeast(role, "editor") ? <li><NavLink to="/trending" className={nav}>Trending</NavLink></li> : null}
              {can(role, "sponsored:manage") ? <li><NavLink to="/sponsored" className={nav}>Sponsored</NavLink></li> : null}
              {can(role, "ads:manage") ? <li><NavLink to="/ads" className={nav}>Ads</NavLink></li> : null}
              <li><NavLink to="/link-safety" className={nav}>Link safety</NavLink></li>
              {can(role, "subscribers:manage") ? <li><NavLink to="/subscribers" className={nav}>Subscribers</NavLink></li> : null}
              {can(role, "audit:view") ? <li><NavLink to="/audit" className={nav}>Audit log</NavLink></li> : null}
              {role !== "admin" && can(role, "payments:view_own") ? <li><NavLink to="/earnings" className={nav}>My earnings</NavLink></li> : null}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NavLink to="/posts/new" className="btn btn-primary">New post</NavLink>
            <span className="hidden text-right text-sm leading-tight md:block">
              <span className="block font-semibold">{me.user.name ?? me.user.email}</span>
              <span className="text-muted capitalize">{role}</span>
            </span>
            <Form method="post" action="/logout">
              <button className="btn">Sign out</button>
            </Form>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
