import { Link } from "react-router";

export function SectionHeading({ title, to, linkLabel }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      {to ? (
        <Link to={to} className="text-sm font-semibold text-link hover:underline">
          {linkLabel ?? `More ${title.toLowerCase()}`}
        </Link>
      ) : null}
    </div>
  );
}
