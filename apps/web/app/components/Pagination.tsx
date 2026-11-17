import { Link } from "react-router";

export function Pagination({ path, page, pageSize, total }: { path: string; page: number; pageSize: number; total: number }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const sep = path.includes("?") ? "&" : "?";
  const href = (n: number) => (n === 1 ? path : `${path}${sep}page=${n}`);
  const btn = "rounded-md border border-line px-4 py-2 font-medium hover:border-ink";
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link to={href(page - 1)} rel="prev" className={btn}>
          Newer stories
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Page {page} of {last}
      </span>
      {page < last ? (
        <Link to={href(page + 1)} rel="next" className={btn}>
          Older stories
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
