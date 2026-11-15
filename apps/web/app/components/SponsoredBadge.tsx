export function SponsoredBadge({ sponsor }: { sponsor?: string | null }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-ink/40 px-1.5 py-0.5 text-xs font-semibold text-ink">
      Sponsored{sponsor ? <span className="sr-only"> by {sponsor}</span> : null}
    </span>
  );
}
