import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import fontUrl from "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: fontUrl, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
];

const fontFace = `@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-display:swap;font-weight:200 800;src:url(${fontUrl}) format("woff2")}`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%231B1F5E'/%3E%3Ccircle cx='32' cy='32' r='18' fill='%23FFC72C'/%3E%3C/svg%3E" />
        <style dangerouslySetInnerHTML={{ __html: fontFace }} />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const detail =
    isRouteErrorResponse(error) && typeof error.data === "object" && error.data && "error" in error.data
      ? String((error.data as { error: unknown }).error)
      : null;
  const copy: Record<number, [string, string]> = {
    403: ["You don't have access to this", detail ?? "Ask an admin if you need a different role."],
    404: ["Not found", "The post or page may have been deleted, or you may not have access to it."],
    503: ["Studio can't reach the API", detail ?? "Try again in a minute."],
  };
  const [title, body] = copy[status] ?? ["Something went wrong", detail ?? "Refresh the page to try again."];
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <title>{`${title} | CoinGist Studio`}</title>
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <div className="mt-6 flex gap-3">
        <Link to="/posts" className="btn btn-primary">Go to posts</Link>
        <form method="post" action="/logout">
          <button className="btn">Sign out</button>
        </form>
      </div>
    </main>
  );
}
