import { beforeAll, describe, expect, it } from "vitest";

let mod: typeof import("./image");
beforeAll(async () => {
  Object.assign(globalThis, { __COINGIST_IMAGE_CDN__: true, __COINGIST_SITE_ORIGIN__: "https://coingist.test" });
  mod = await import("./image");
});

describe("responsive images", () => {
  it("resizes our own files, absolute or relative, through Netlify Image CDN", () => {
    for (const url of ["/covers/a.webp", "https://coingist.test/covers/a.webp"]) {
      const img = mod.responsiveImage(url, 400);
      expect(img.src).toBe("/.netlify/images?url=%2Fcovers%2Fa.webp&w=400&q=65");
      expect(img.srcSet?.split(", ").map((s) => s.split(" ")[1])).toEqual(["320w", "480w", "640w", "800w"]);
    }
  });

  it("resizes Supabase Storage uploads, and leaves other sites' images and SVGs alone", () => {
    const upload = "https://abc123.supabase.co/storage/v1/object/public/media/uploads/x.jpg";
    expect(mod.responsiveImage(upload).src).toContain("/.netlify/images?url=https%3A%2F%2Fabc123.supabase.co");
    expect(mod.responsiveImage("https://example.com/x.jpg")).toEqual({ src: "https://example.com/x.jpg" });
    expect(mod.responsiveImage("/logo.svg")).toEqual({ src: "/logo.svg" });
    expect(mod.responsiveImage("https://coingist.test.evil.com/x.jpg")).toEqual({ src: "https://coingist.test.evil.com/x.jpg" });
  });

  it("offers AVIF versions of the same widths, only for images it resizes", () => {
    expect(mod.avifSrcSet("/covers/a.webp", 400)?.split(", ")).toEqual([
      "/.netlify/images?url=%2Fcovers%2Fa.webp&w=320&q=50&fm=avif 320w",
      "/.netlify/images?url=%2Fcovers%2Fa.webp&w=480&q=50&fm=avif 480w",
      "/.netlify/images?url=%2Fcovers%2Fa.webp&w=640&q=50&fm=avif 640w",
      "/.netlify/images?url=%2Fcovers%2Fa.webp&w=800&q=50&fm=avif 800w",
    ]);
    expect(mod.avifSrcSet("https://example.com/x.jpg")).toBeNull();
  });

  it("gives avatars one sharp square at twice their size", () => {
    expect(mod.fixedImage("/a.png", 28)).toBe("/.netlify/images?url=%2Fa.png&w=56&h=56&fit=cover&q=70");
  });
});
