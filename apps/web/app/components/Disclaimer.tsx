export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`rounded-md border border-line p-4 text-sm text-muted ${className}`}>
      <strong className="text-ink">Not financial advice.</strong> CoinGist publishes news and
      education. Crypto assets are volatile and you can lose money. Do your own research before you
      buy, sell or hold anything.
    </p>
  );
}
