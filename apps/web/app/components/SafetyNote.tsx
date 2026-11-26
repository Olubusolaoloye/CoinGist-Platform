/** The standing warning shown with every airdrop and opportunity. */
export function SafetyNote({ className = "" }: { className?: string }) {
  return (
    <aside aria-label="Stay safe" className={`rounded-2xl border-l-4 border-warn bg-surface p-4 text-sm ${className}`}>
      <p className="font-semibold">Stay safe</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        <li>Never share your seed phrase, private key or wallet password. No real airdrop asks for them.</li>
        <li>Never send money or crypto to qualify for a reward.</li>
        <li>Use the official link on this page, not links from DMs, comments or ads.</li>
      </ul>
      <p className="mt-2 text-muted">We check every listing, but we can&rsquo;t guarantee any project. Not financial advice.</p>
    </aside>
  );
}
