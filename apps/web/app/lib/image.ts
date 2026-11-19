/**
 * Right-sized images through Netlify Image CDN (resizes, recompresses and serves AVIF/WebP to
 * browsers that accept them). Only on Netlify builds; elsewhere images are served as they are.
 */
declare const __COINGIST_IMAGE_CDN__: boolean | undefined;
declare const __COINGIST_SITE_ORIGIN__: string | undefined;
const CDN = typeof __COINGIST_IMAGE_CDN__ !== "undefined" && __COINGIST_IMAGE_CDN__;
/** This site's own origin (from the build), so absolute links to our own files count as local. */
const ORIGIN = typeof __COINGIST_SITE_ORIGIN__ !== "undefined" ? __COINGIST_SITE_ORIGIN__ : "";

/** `https://this-site/covers/a.webp` → `/covers/a.webp`; anything else unchanged. */
function local(url: string): string {
  return ORIGIN && url.startsWith(`${ORIGIN}/`) ? url.slice(ORIGIN.length) : url;
}

/** Widths offered to the browser, which picks one from `sizes` and the screen's pixel density. */
const WIDTHS = [320, 480, 640, 800, 1080, 1280, 1600] as const;

/** Our own files, and uploads in Supabase Storage (allowed in netlify.toml `remote_images`). */
const TRANSFORMABLE = /^(\/(?!\/)|https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/)/;

function cdnUrl(url: string, width: number, quality: number): string {
  return `/.netlify/images?url=${encodeURIComponent(local(url))}&w=${width}&q=${quality}`;
}

/** `src` and `srcSet` for an image shown at most `maxWidth` CSS pixels wide (2x screens included). */
export function responsiveImage(url: string, maxWidth = 1600, quality = 70): { src: string; srcSet?: string } {
  if (!CDN || !TRANSFORMABLE.test(local(url)) || url.endsWith(".svg")) return { src: url };
  const widths = WIDTHS.filter((w) => w <= maxWidth * 2);
  return {
    src: cdnUrl(url, Math.min(maxWidth, 1080), quality),
    srcSet: widths.map((w) => `${cdnUrl(url, w, quality)} ${w}w`).join(", "),
  };
}

/** A small fixed-size image (avatars): one URL at twice the display size, for sharp 2x screens. */
export function fixedImage(url: string, cssPx: number): string {
  if (!CDN || !TRANSFORMABLE.test(local(url)) || url.endsWith(".svg")) return url;
  return `/.netlify/images?url=${encodeURIComponent(local(url))}&w=${cssPx * 2}&h=${cssPx * 2}&fit=cover&q=70`;
}
