import type { ImageRef } from "@coingist/types";
import { Picture } from "./Picture";

const RATIOS = { wide: "aspect-[16/9]", photo: "aspect-[4/3]" } as const;

/**
 * Image with a fixed aspect ratio (reserves space, so no layout shift) and a quiet placeholder
 * when a post has no hero image. Only the LCP image should pass `priority`.
 */
export function PostImage({
  image,
  ratio = "wide",
  priority = false,
  sizes,
  className = "w-full",
}: {
  image: ImageRef | null;
  ratio?: keyof typeof RATIOS;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const box = `${RATIOS[ratio]} overflow-hidden rounded-md bg-line ${className}`;
  if (!image) return <div className={`${box} placeholder-art`} aria-hidden="true" />;
  return (
    <div className={box}>
      <Picture
        url={image.url}
        maxWidth={ratio === "wide" ? 1200 : 800}
        alt={image.alt}
        width={ratio === "wide" ? 1200 : 800}
        height={ratio === "wide" ? 675 : 600}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
