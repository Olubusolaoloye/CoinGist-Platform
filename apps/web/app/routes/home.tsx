import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "CoinGist" }, { name: "description", content: "Web3 and crypto news and gist, with an African lens." }];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">CoinGist</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">Web3 and crypto news and gist, with an African lens.</p>
    </main>
  );
}
