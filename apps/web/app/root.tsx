import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import fontUrl from "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url";
import type { Route } from "./+types/root";
import { BottomNav } from "./components/BottomNav";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { api } from "./lib/api.server";
import { isDemo, siteConfig } from "./lib/config.server";
import { readTheme } from "./lib/theme.server";
import { useNonce } from "./lib/nonce";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: fontUrl, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/logo-512.png" },
  { rel: "alternate", type: "application/rss+xml", title: "CoinGist", href: "/rss.xml" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const site = siteConfig();
  // Navigation must not take the whole site down if the API hiccups.
  const categories = await api.listCategories().catch(() => []);
  return data({ site, categories, theme: readTheme(request), demo: isDemo() });
}

// Font face is declared inline so its URL comes from the build (hashed, cacheable).
const fontFace = `@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-display:swap;font-weight:200 800;src:url(${fontUrl}) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useNonce();
  const root = useRouteLoaderData<typeof loader>("root");
  const theme = root?.theme ?? "system";
  return (
    <html lang="en" className={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1b1f5e" />
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: fontFace }} />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-gist px-4 py-2 font-semibold text-gist-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        {root?.demo ? (
          <p className="bg-gist px-4 py-2 text-center text-sm font-semibold text-gist-ink">
            Preview with fictional sample content. These aren't real stories.
          </p>
        ) : null}
        <SiteHeader categories={root?.categories ?? []} theme={theme} />
        <div id="main" tabIndex={-1} className="outline-none">
          {children}
        </div>
        <SiteFooter categories={root?.categories ?? []} />
        <BottomNav />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <title>{notFound ? "Page not found | CoinGist" : "Something went wrong | CoinGist"}</title>
      <meta name="robots" content="noindex" />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        {notFound ? "We couldn't find that page" : "This page didn't load"}
      </h1>
      <p className="mt-3 text-lg text-muted">
        {notFound
          ? "The link may be old or the story may have moved. Try the latest news instead."
          : "Our servers had a problem loading this page. Refresh to try again, or head back to the latest news."}
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-semibold text-paper hover:opacity-90"
      >
        Go to the homepage
      </Link>
    </main>
  );
}
