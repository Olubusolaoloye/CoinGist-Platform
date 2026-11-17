import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";

/** Layout for static editorial pages (about, policies). */
export function ProsePage({ title, intro, path, children }: { title: string; intro: string; path: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: title, path }]} />
      <header className="mt-4 border-b-2 border-ink pb-5">
        <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-muted">{intro}</p>
      </header>
      <div className="article-body mt-8">{children}</div>
    </main>
  );
}
