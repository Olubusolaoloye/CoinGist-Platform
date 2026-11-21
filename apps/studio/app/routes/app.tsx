import { useEffect, useRef } from "react";
import { data, Form, NavLink, Outlet, useLocation, useSearchParams, type ShouldRevalidateFunctionArgs } from "react-router";
import { can, hasAtLeast, isStaff, type Role } from "@coingist/types";
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

/**
 * Who's signed in (name, role) rarely changes while Studio is open, so in-app links don't
 * re-fetch it: only form submissions (which may change it) and full page loads do. Every page's
 * own loader still checks the session, and the API checks permissions on every request.
 */
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== "GET") return defaultShouldRevalidate;
  return false;
}

/** 24px line icons, drawn for Studio's sidebar. */
const ICONS = {
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z",
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  review: "M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4",
  trending: "M4 17l5-5 4 4 7-8M15 8h5v5",
  sponsored: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z",
  ads: "M4 6h16v10H4zM8 20h8M12 16v4",
  links: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  subscribers: "M4 6h16v12H4zM4 7l8 6 8-6",
  audit: "M7 4h10l3 3v13H4V4zM8 10h8M8 14h8M8 18h5",
  earnings: "M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.7 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3",
  admin: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5M16 5.5a3 3 0 0 1 0 5.5M18 14.8c1.5.7 2.6 2.4 3 5.2",
  payouts: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  images: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  author: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.2-6 8-6s7 2 8 6",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const item = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-medium transition-colors ${
    isActive ? "bg-white/12 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]" : "text-night-muted hover:bg-white/6 hover:text-white"
  }`;

type Link = { to: string; label: string; icon: keyof typeof ICONS; end?: boolean };

function navFor(role: Role, userId: string): Array<{ title: string | null; links: Link[] }> {
  const work: Link[] = [{ to: "/posts", label: "Stories", icon: "board", end: true }];
  if (hasAtLeast(role, "editor")) {
    work.unshift({ to: "/dashboard", label: "Dashboard", icon: "dashboard" });
    work.push({ to: "/review", label: "Review queue", icon: "review" }, { to: "/trending", label: "Trending", icon: "trending" });
  }
  const business: Link[] = [];
  if (can(role, "sponsored:manage")) business.push({ to: "/sponsored", label: "Sponsored", icon: "sponsored" });
  if (can(role, "ads:manage")) business.push({ to: "/ads", label: "Ads", icon: "ads" });
  if (can(role, "subscribers:manage")) business.push({ to: "/subscribers", label: "Subscribers", icon: "subscribers" });
  const tools: Link[] = [
    hasAtLeast(role, "editor")
      ? { to: "/authors", label: "Authors", icon: "author" }
      : { to: `/authors/${userId}`, label: "My author profile", icon: "author" },
    { to: "/link-safety", label: "Link safety", icon: "links" },
  ];
  if (role !== "admin" && can(role, "payments:view_own")) tools.push({ to: "/earnings", label: "My earnings", icon: "earnings" });
  const admin: Link[] = [];
  if (role === "admin") {
    admin.push(
      { to: "/admin", label: "Overview", icon: "admin", end: true },
      { to: "/admin/team", label: "Team and roles", icon: "team" },
      { to: "/admin/payouts", label: "Payouts", icon: "payouts" },
      { to: "/admin/site-images", label: "Site images", icon: "images" },
    );
  }
  if (can(role, "audit:view")) admin.push({ to: "/audit", label: "Audit log", icon: "audit" });
  return [
    { title: null, links: work },
    { title: "Business", links: business },
    { title: "Tools", links: tools },
    { title: "Admin", links: admin },
  ].filter((g) => g.links.length > 0);
}

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { me } = loaderData;
  const role = me.user.role;
  const name = me.user.name ?? me.user.email;
  const groups = navFor(role, me.user.id);
  const [params] = useSearchParams();
  const location = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.pathname]);

  const nav = (
    <nav aria-label="Studio" className="space-y-6">
      {groups.map((g) => (
        <div key={g.title ?? "work"}>
          {g.title ? <p className="px-3 pb-1.5 text-xs font-semibold text-night-muted/80">{g.title}</p> : null}
          <ul className="space-y-0.5">
            {g.links.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} className={item}>
                  <Icon name={l.icon} />
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-2.5 ring-1 ring-white/10">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-gist text-sm font-bold text-gist-ink">
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <NavLink to={`/authors/${me.user.id}`} className="block truncate font-semibold text-white hover:underline" title="Edit my author profile">{name}</NavLink>
        <span className="block text-sm text-night-muted capitalize">{role}</span>
      </span>
      <Form method="post" action="/logout">
        <button className="grid size-9 place-items-center rounded-full text-night-muted hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
          </svg>
        </button>
      </Form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden bg-night text-night-ink lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8 lg:overflow-y-auto lg:p-5">
        <NavLink to="/" className="rounded-lg px-1 py-1 text-white">
          <Wordmark />
        </NavLink>
        <div className="flex-1">{nav}</div>
        {userCard}
      </aside>

      <div className="studio-haze min-w-0">
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5">
          <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4">
            <details ref={menu} className="relative lg:hidden">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-xl bg-night text-white [&::-webkit-details-marker]:hidden" aria-label="Menu">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </summary>
              <div className="absolute left-0 z-40 mt-2 w-72 space-y-5 rounded-2xl bg-night p-4 text-night-ink shadow-2xl">
                {nav}
                {userCard}
              </div>
            </details>
            <p className="hidden leading-tight md:block">
              <span className="block text-sm text-muted">Welcome back,</span>
              <span className="block font-semibold">{name}</span>
            </p>
            <Form method="get" action="/posts" role="search" className="mx-auto flex min-w-0 flex-1 md:max-w-md">
              <label htmlFor="studio-search" className="sr-only">Search stories</label>
              <div className="relative w-full">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <input id="studio-search" name="q" type="search" defaultValue={location.pathname === "/posts" ? (params.get("q") ?? "") : ""}
                  placeholder="Search by title, author or topic"
                  className="w-full rounded-full border border-line bg-surface/80 py-2.5 pr-4 pl-10 text-sm outline-none focus:border-link" />
              </div>
              {hasAtLeast(role, "editor") ? <input type="hidden" name="view" value="all" /> : null}
            </Form>
            <NavLink to="/posts/new" className="btn btn-primary shrink-0">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span className="hidden sm:inline">New story</span>
              <span className="sr-only sm:hidden">New story</span>
            </NavLink>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
