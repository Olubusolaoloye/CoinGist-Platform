import type { ImgHTMLAttributes } from "react";
import { avifSrcSet, responsiveImage } from "~/lib/image";

/**
 * A right-sized image: AVIF for browsers that support it, WebP otherwise (see lib/image.ts).
 * `maxWidth` is the widest it is ever shown, in CSS pixels; `sizes` tells the browser how wide
 * it is on this screen. The <picture> wrapper is display: contents, so layout is unchanged.
 */
export function Picture({
  url,
  maxWidth,
  sizes,
  ...img
}: { url: string; maxWidth: number; sizes?: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes">) {
  const webp = responsiveImage(url, maxWidth);
  const avif = avifSrcSet(url, maxWidth);
  const tag = <img {...webp} sizes={webp.srcSet ? sizes : undefined} {...img} />;
  if (!avif) return tag;
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      {tag}
    </picture>
  );
}
