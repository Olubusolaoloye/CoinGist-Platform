import { Link } from "react-router";
import type { Category } from "@coingist/types";
import { Picture } from "./Picture";

/** Topic covers. The images are set by admins in Studio (Admin → Site images). */
export function TopicTiles({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="topics-h">
      <h2 id="topics-h" className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Browse topics</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {categories.map((c, i) => (
          <li key={c.slug} className={i === 0 ? "col-span-2 row-span-2" : ""}>
            <Link
              to={`/category/${c.slug}`}
              className={`group relative isolate block h-full overflow-hidden rounded-3xl bg-night ${i === 0 ? "min-h-[16rem] sm:min-h-[22rem]" : "min-h-[10rem] sm:min-h-[10.5rem]"}`}
            >
              {c.image ? (
                <Picture url={c.image.url} maxWidth={i === 0 ? 720 : 360} sizes={i === 0 ? "(min-width: 1024px) 560px, 100vw" : "(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw"} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              ) : (
                <span aria-hidden="true" className="placeholder-art absolute inset-0" />
              )}
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night/75 via-transparent to-transparent" />
              <span className="glass-photo absolute inset-x-2.5 bottom-2.5 rounded-2xl px-3.5 py-2.5">
                <span className={`block font-display font-extrabold ${i === 0 ? "text-2xl" : "text-lg"}`}>{c.name}</span>
                {i === 0 && c.description ? <span className="mt-0.5 line-clamp-2 block text-sm text-white/80">{c.description}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
