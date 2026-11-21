import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgRepositories } from "../src/repositories.js";
import { createTestDb, type TestDb, type TestUser } from "./harness.js";

let t: TestDb;
let repos: ReturnType<typeof createPgRepositories>;
let admin: TestUser, editor: TestUser, reader: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  repos = createPgRepositories(t.db);
  admin = await t.createUser({ role: "admin" });
  editor = await t.createUser({ role: "editor" });
  reader = await t.createUser({ email: "already.here@example.com" });
});
afterAll(() => t.close());

const roleOf = async (email: string) =>
  (await t.pg.query<{ role: string }>("select role from public.users where lower(email) = lower($1)", [email])).rows[0]?.role;

describe("staff invites", () => {
  it("gives the invited role to the account created for that address (any letter case)", async () => {
    expect(await repos.users.invite(admin.claims, { email: "new.writer@example.com", role: "writer" })).toBe("invited");
    expect((await repos.users.listInvites(admin.claims)).map((i) => i.email)).toContain("new.writer@example.com");

    await t.createUser({ email: "New.Writer@Example.com" }); // signs up (email link or Google)
    expect(await roleOf("new.writer@example.com")).toBe("writer");
    expect((await repos.users.listInvites(admin.claims)).map((i) => i.email)).not.toContain("new.writer@example.com");

    const log = await t.pg.query<{ action: string }>("select action from public.audit_logs where action like 'user.invite%' order by created_at");
    expect(log.rows.map((r) => r.action)).toEqual(["user.invited", "user.invite_accepted"]);
  });

  it("applies the role straight away when the address already has an account", async () => {
    expect(await repos.users.invite(admin.claims, { email: "ALREADY.here@example.com", role: "editor" })).toBe("existing");
    expect(await roleOf(reader.email)).toBe("editor");
  });

  it("re-inviting replaces the open invite; expired or cancelled invites give nothing", async () => {
    await repos.users.invite(admin.claims, { email: "twice@example.com", role: "editor" });
    await repos.users.invite(admin.claims, { email: "twice@example.com", role: "writer" });
    const open = (await repos.users.listInvites(admin.claims)).filter((i) => i.email === "twice@example.com");
    expect(open).toHaveLength(1);
    expect(open[0]!.role).toBe("writer");

    await repos.users.cancelInvite(admin.claims, open[0]!.id);
    await t.createUser({ email: "twice@example.com" });
    expect(await roleOf("twice@example.com")).toBe("reader");

    await repos.users.invite(admin.claims, { email: "late@example.com", role: "writer" });
    await t.pg.query("update public.staff_invites set expires_at = now() - interval '1 minute' where email = 'late@example.com'");
    await t.createUser({ email: "late@example.com" });
    expect(await roleOf("late@example.com")).toBe("reader");
  });

  it("only admins can invite, list or cancel", async () => {
    await expect(repos.users.invite(editor.claims, { email: "x@example.com", role: "writer" })).rejects.toMatchObject({ kind: "forbidden" });
    expect(await repos.users.listInvites(editor.claims)).toEqual([]);
    await repos.users.invite(admin.claims, { email: "keep@example.com", role: "writer" });
    const id = (await repos.users.listInvites(admin.claims)).find((i) => i.email === "keep@example.com")!.id;
    await expect(repos.users.cancelInvite(editor.claims, id)).rejects.toMatchObject({ kind: "not_found" });
    await expect(t.db.asUser(editor.claims, (q) => q.query("insert into public.staff_invites (email, role) values ('sneaky@example.com', 'admin')"))).rejects.toThrow();
    await expect(t.db.asUser(null, (q) => q.query("select * from public.staff_invites"))).rejects.toThrow(/permission denied/);
  });

  it("never invites someone as a reader", async () => {
    await expect(t.db.asUser(admin.claims, (q) => q.query("select public.invite_staff('r@example.com', 'reader')"))).rejects.toThrow(/writer, editor or admin/);
  });
});
