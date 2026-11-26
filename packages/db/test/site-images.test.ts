import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContentRepository } from "../src/content.js";
import { createStudioRepository } from "../src/studio.js";
import { createTestDb, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let writer: TestUser, admin: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  writer = await t.createUser({ role: "writer" });
  admin = await t.createUser({ role: "admin" });
  await t.pg.query("insert into public.categories (slug, name) values ('bitcoin', 'Bitcoin')");
});
afterAll(() => t.close());

describe("category cover images", () => {
  it("admins set a cover image that the public site reads", async () => {
    const studio = createStudioRepository(t.db);
    const updated = await studio.updateCategory(admin.claims, "bitcoin", {
      description: "All things BTC",
      imageUrl: "https://cdn.test/btc.webp",
      imageAlt: "A bitcoin coin",
    });
    expect(updated?.image).toEqual({ url: "https://cdn.test/btc.webp", alt: "A bitcoin coin" });
    const pub = await createContentRepository(t.db).getCategory("bitcoin");
    expect(pub).toMatchObject({ description: "All things BTC", image: { url: "https://cdn.test/btc.webp", alt: "A bitcoin coin" } });
  });

  it("removing the URL clears the alt text too", async () => {
    const updated = await createStudioRepository(t.db).updateCategory(admin.claims, "bitcoin", { description: "", imageUrl: "", imageAlt: "stale" });
    expect(updated).toMatchObject({ description: null, image: null });
  });

  it("writers can't change categories", async () => {
    const r = await createStudioRepository(t.db).updateCategory(writer.claims, "bitcoin", { imageUrl: "https://x.test/a.png", imageAlt: "a" });
    expect(r).toBeNull();
  });

  it("rejects non-https image URLs at the database", async () => {
    await expect(
      t.pg.query("update public.categories set image_url = 'http://x.test/a.png', image_alt = 'a' where slug = 'bitcoin'"),
    ).rejects.toThrow();
  });
});
