/** CoinGist wordmark: "Coin" in ink, "Gist" set on a danfo-yellow block. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[1.6rem] leading-none font-extrabold tracking-tight ${className}`}>
      Coin<span className="ml-0.5 rounded-sm bg-gist px-1 text-gist-ink">Gist</span>
    </span>
  );
}
