/** The signature element: the story in a few bullets, on danfo yellow. */
export function GistBox({
  bullets,
  heading = "The gist",
  className = "",
}: {
  bullets: string[];
  heading?: string;
  className?: string;
}) {
  if (bullets.length === 0) return null;
  return (
    <aside
      aria-label={heading}
      className={`gist-box rounded-md bg-gist px-5 py-4 text-gist-ink ${className}`}
    >
      <h2 className="font-display text-lg font-extrabold">{heading}</h2>
      <ul className="mt-2 space-y-1.5 text-[0.975rem] leading-snug">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-gist-ink" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
