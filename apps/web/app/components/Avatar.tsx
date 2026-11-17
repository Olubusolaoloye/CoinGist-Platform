function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** Author photo, or initials on danfo yellow. Decorative: the name is always next to it. */
export function Avatar({ name, url, size = "sm" }: { name: string; url: string | null | undefined; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "size-7 text-[0.68rem]" : "size-10 text-sm";
  if (url) return <img src={url} alt="" width={40} height={40} loading="lazy" className={`${cls} shrink-0 rounded-full object-cover`} />;
  return (
    <span aria-hidden="true" className={`${cls} inline-flex shrink-0 items-center justify-center rounded-full bg-gist font-bold text-gist-ink`}>
      {initials(name)}
    </span>
  );
}
