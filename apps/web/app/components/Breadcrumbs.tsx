import { Link } from "react-router";

export function Breadcrumbs({ items }: { items: Array<{ name: string; path: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-x-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-ink">{item.name}</span>
            ) : (
              <Link to={item.path} className="hover:underline">{item.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
