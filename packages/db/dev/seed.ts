/**
 * Sample content for local development and end-to-end tests.
 * All people, sponsors and stories here are fictional placeholders.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { PostType, RichTextNode } from "@coingist/types";

const text = (t: string, marks?: RichTextNode["marks"]): RichTextNode => ({
  type: "text",
  text: t,
  ...(marks ? { marks } : {}),
});
const p = (...parts: Array<string | RichTextNode>): RichTextNode => ({
  type: "paragraph",
  content: parts.map((x) => (typeof x === "string" ? text(x) : x)),
});
const h2 = (t: string): RichTextNode => ({ type: "heading", attrs: { level: 2 }, content: [text(t)] });
const ul = (...items: string[]): RichTextNode => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});
const quote = (t: string): RichTextNode => ({ type: "blockquote", content: [p(t)] });
const link = (label: string, href: string) => text(label, [{ type: "link", attrs: { href } }]);
const bold = (t: string) => text(t, [{ type: "bold" }]);

const doc = (...content: RichTextNode[]) => ({ type: "doc", content });

const AUTHORS = [
  {
    key: "amara",
    name: "Amara Okafor",
    role: "writer",
    slug: "amara-okafor",
    bio: "Covers markets and on-chain data from Lagos.",
    expertise: ["Markets", "On-chain data"],
    socials: { x: "https://x.com/example" },
  },
  {
    key: "kwame",
    name: "Kwame Mensah",
    role: "writer",
    slug: "kwame-mensah",
    bio: "Writes about payments, stablecoins and remittances across West Africa.",
    expertise: ["Stablecoins", "Payments"],
    socials: {},
  },
  {
    key: "zanele",
    name: "Zanele Dube",
    role: "writer",
    slug: "zanele-dube",
    bio: "Explains crypto basics for first-time users. Based in Johannesburg.",
    expertise: ["Education", "Security"],
    socials: {},
  },
  {
    key: "tunde",
    name: "Tunde Bello",
    role: "editor",
    slug: "tunde-bello",
    bio: "Managing editor. Policy and regulation desk.",
    expertise: ["Regulation", "Policy"],
    socials: {},
  },
] as const;

const CATEGORIES = [
  ["markets", "Markets", "Prices, trading and market structure."],
  ["bitcoin", "Bitcoin", "News and analysis on Bitcoin."],
  ["ethereum", "Ethereum", "Ethereum, layer 2s and the EVM ecosystem."],
  ["stablecoins", "Stablecoins", "Dollar-pegged tokens, payments and remittances."],
  ["regulation", "Regulation", "Policy, law and enforcement."],
  ["africa", "Africa", "Crypto and Web3 across the continent."],
  ["security", "Security", "Scams, hacks and how to stay safe."],
] as const;

const TAGS = [
  ["p2p", "P2P"],
  ["remittances", "Remittances"],
  ["wallets", "Wallets"],
  ["scams", "Scams"],
  ["layer-2", "Layer 2"],
  ["usdt", "USDT"],
  ["nigeria", "Nigeria"],
  ["kenya", "Kenya"],
  ["south-africa", "South Africa"],
] as const;

type SeedPost = {
  type: PostType;
  title: string;
  slug: string;
  excerpt: string;
  bullets: string[];
  author: (typeof AUTHORS)[number]["key"];
  category: (typeof CATEGORIES)[number][0];
  tags: Array<(typeof TAGS)[number][0]>;
  hoursAgo: number;
  cover?: number;
  sponsored?: boolean;
  status?: "published" | "draft";
};

const body = (topic: string) =>
  doc(
    p(
      `This is sample content for local development. It stands in for a real CoinGist story about ${topic}.`,
    ),
    h2("What happened"),
    p(
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ",
      bold("Key point in bold. "),
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    ),
    ul("First takeaway for readers", "Second takeaway, with context", "Third takeaway"),
    h2("Why it matters"),
    p(
      "Ut enim ad minim veniam, quis nostrud exercitation. Read our ",
      link("editorial policy", "/editorial-policy"),
      " or the ",
      link("example reference", "https://example.com/report"),
      ".",
    ),
    quote("A short pull quote from a fictional source goes here."),
    p("Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore."),
  );

const POSTS: SeedPost[] = [
  { type: "news", title: "Stablecoin transfers climb as users look for cheaper remittances", slug: "stablecoin-transfers-climb-remittances", excerpt: "Sample story: why more people are sending dollar-pegged tokens home instead of using traditional transfer services.", bullets: ["Stablecoin use for remittances is growing", "Fees are the main driver", "Regulatory clarity is still patchy"], author: "kwame", category: "stablecoins", tags: ["remittances", "usdt"], hoursAgo: 2, cover: 1 },
  { type: "news", title: "Bitcoin holds steady ahead of a busy week for markets", slug: "bitcoin-holds-steady-busy-week", excerpt: "Sample story: traders wait on macro data while on-chain activity stays flat.", bullets: ["Price range is tight", "On-chain activity is flat", "Watch the macro calendar"], author: "amara", category: "bitcoin", tags: [], hoursAgo: 5, cover: 2 },
  { type: "news", title: "Regulators publish draft rules for digital asset exchanges", slug: "regulators-draft-rules-exchanges", excerpt: "Sample story: what a licensing framework could mean for local exchanges and their users.", bullets: ["Draft rules open for comment", "Exchanges would need a licence", "Consumer protection is the focus"], author: "tunde", category: "regulation", tags: ["nigeria"], hoursAgo: 9, cover: 3 },
  { type: "gist", title: "The gist: why P2P trading is still king in Nigeria", slug: "gist-p2p-trading-nigeria", excerpt: "Sample gist: a quick, plain-English take on peer-to-peer crypto trading.", bullets: ["P2P fills gaps left by banks", "Escrow protects both sides", "Always check counterparty ratings"], author: "amara", category: "africa", tags: ["p2p", "nigeria"], hoursAgo: 12, cover: 4 },
  { type: "learn", title: "What is a stablecoin? A beginner's guide", slug: "what-is-a-stablecoin", excerpt: "Sample guide: how stablecoins keep their value, and the risks to understand before you use one.", bullets: ["Stablecoins track another asset, usually the US dollar", "Backing and audits differ by issuer", "They are not bank deposits"], author: "zanele", category: "stablecoins", tags: ["usdt"], hoursAgo: 20, cover: 5 },
  { type: "news", title: "Layer 2 fees drop after network upgrade", slug: "layer-2-fees-drop-upgrade", excerpt: "Sample story: cheaper transactions on Ethereum rollups and what it means for everyday users.", bullets: ["Rollup fees fell sharply", "Cheaper for small payments", "Bridging still carries risk"], author: "amara", category: "ethereum", tags: ["layer-2"], hoursAgo: 26, cover: 6 },
  { type: "gist", title: "The gist: spotting a fake airdrop in 30 seconds", slug: "gist-spotting-fake-airdrop", excerpt: "Sample gist: the red flags that give away most airdrop scams.", bullets: ["Never connect your wallet to unknown links", "Real projects don't DM you first", "Check the official account"], author: "zanele", category: "security", tags: ["scams", "wallets"], hoursAgo: 30 },
  { type: "learn", title: "How to set up your first self-custody wallet safely", slug: "set-up-self-custody-wallet", excerpt: "Sample guide: step-by-step wallet setup, seed phrase storage, and common mistakes.", bullets: ["Write your seed phrase on paper", "Never share it with anyone", "Test with a small amount first"], author: "zanele", category: "security", tags: ["wallets"], hoursAgo: 40, cover: 2 },
  { type: "news", title: "Mobile money and crypto: Kenya's builders find common ground", slug: "kenya-mobile-money-crypto-builders", excerpt: "Sample story: startups connecting mobile money rails to on-chain payments.", bullets: ["Mobile money is the on-ramp", "Builders focus on merchant payments", "Partnerships with telcos matter"], author: "kwame", category: "africa", tags: ["kenya", "remittances"], hoursAgo: 50, cover: 3 },
  { type: "gist", title: "The gist: what a market maker actually does", slug: "gist-what-market-maker-does", excerpt: "Sample gist: liquidity, spreads and why they matter for your trade.", bullets: ["They quote buy and sell prices", "Tighter spreads mean cheaper trades", "Thin markets move fast"], author: "amara", category: "markets", tags: [], hoursAgo: 60 },
  { type: "learn", title: "Understanding gas fees on Ethereum", slug: "understanding-gas-fees-ethereum", excerpt: "Sample guide: what gas is, why it changes, and how to pay less.", bullets: ["Gas pays for computation", "Fees rise when the network is busy", "Layer 2s are cheaper"], author: "zanele", category: "ethereum", tags: ["layer-2"], hoursAgo: 72, cover: 6 },
  { type: "news", title: "South African exchanges report record sign-ups", slug: "south-africa-exchanges-record-signups", excerpt: "Sample story: new users arrive as licensing rules bed in.", bullets: ["Sign-ups rose this quarter", "Licensing boosted trust", "Most new users buy small amounts"], author: "tunde", category: "africa", tags: ["south-africa"], hoursAgo: 90, cover: 1 },
  { type: "sponsored", title: "How ExamplePay makes cross-border payments simpler", slug: "examplepay-cross-border-payments", excerpt: "Sponsored sample: a fictional partner explains its product.", bullets: ["Fictional sponsor content", "Clearly labelled as sponsored", "Links use rel=sponsored"], author: "kwame", category: "stablecoins", tags: ["remittances"], hoursAgo: 15, cover: 4, sponsored: true },
  { type: "news", title: "Unpublished draft: should never appear on the site", slug: "unpublished-draft-never-visible", excerpt: "Draft fixture used by tests.", bullets: [], author: "amara", category: "markets", tags: [], hoursAgo: 1, status: "draft" },
];

/** Insert sample data. Expects an empty, freshly migrated database. */
export async function seedDevData(pg: PGlite): Promise<void> {
  const userIds: Record<string, string> = {};
  for (const a of AUTHORS) {
    const res = await pg.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`${a.key}@example.com`, JSON.stringify({ full_name: a.name })],
    );
    const id = res.rows[0]!.id;
    userIds[a.key] = id;
    await pg.query("update public.users set role = $1, two_factor_enabled = true where id = $2", [
      a.role,
      id,
    ]);
    await pg.query(
      `insert into public.author_profiles (user_id, slug, bio, expertise, socials)
       values ($1, $2, $3, $4, $5)`,
      [id, a.slug, a.bio, a.expertise, JSON.stringify(a.socials)],
    );
  }
  const admin = await pg.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    ["admin@example.com", JSON.stringify({ full_name: "Dev Admin" })],
  );
  await pg.query("update public.users set role = 'admin' where id = $1", [admin.rows[0]!.id]);
  // A plain reader account, to check that non-staff can't use Studio.
  await pg.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [
    "reader@example.com",
    JSON.stringify({ full_name: "Sample Reader" }),
  ]);
  // A second reader, for the deactivate/reactivate flow (so it never disturbs other tests).
  await pg.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [
    "leaver@example.com",
    JSON.stringify({ full_name: "Leaving Reader" }),
  ]);

  const catIds: Record<string, string> = {};
  for (const [i, [slug, name, description]] of CATEGORIES.entries()) {
    const res = await pg.query<{ id: string }>(
      "insert into public.categories (slug, name, description, sort_order) values ($1, $2, $3, $4) returning id",
      [slug, name, description, i],
    );
    catIds[slug] = res.rows[0]!.id;
  }

  const tagIds: Record<string, string> = {};
  for (const [slug, name] of TAGS) {
    const res = await pg.query<{ id: string }>(
      "insert into public.tags (slug, name) values ($1, $2) returning id",
      [slug, name],
    );
    tagIds[slug] = res.rows[0]!.id;
  }

  const sponsor = await pg.query<{ id: string }>(
    "insert into public.sponsors (name, website) values ('ExamplePay (fictional)', 'https://example.com') returning id",
  );

  for (const post of POSTS) {
    const published = (post.status ?? "published") === "published";
    const at = new Date(Date.now() - post.hoursAgo * 3_600_000);
    const res = await pg.query<{ id: string }>(
      `insert into public.posts (
         type, title, slug, excerpt, summary_bullets, body_json, hero_image_url, hero_image_alt,
         category_id, author_id, status, approved_by, approved_at, published_at,
         is_sponsored, sponsor_id, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [
        post.type,
        post.title,
        post.slug,
        post.excerpt,
        post.bullets,
        JSON.stringify(body(post.title.toLowerCase())),
        post.cover ? `/sample/cover-${post.cover}.svg` : null,
        post.cover ? `Illustration for: ${post.title}` : null,
        catIds[post.category],
        userIds[post.author],
        published ? "published" : "draft",
        published ? userIds["tunde"] : null,
        published ? at : null,
        published ? at : null,
        post.sponsored ?? false,
        post.sponsored ? sponsor.rows[0]!.id : null,
        at,
      ],
    );
    for (const tag of post.tags) {
      await pg.query("insert into public.post_tags (post_id, tag_id) values ($1, $2)", [
        res.rows[0]!.id,
        tagIds[tag],
      ]);
    }
  }
  // Editors' picks on the home page.
  await pg.query(
    `update public.posts set featured = true where slug in (
       'what-is-a-stablecoin', 'gist-p2p-trading-nigeria', 'kenya-mobile-money-crypto-builders',
       'set-up-self-custody-wallet', 'regulators-draft-rules-exchanges')`,
  );

  // The sponsored sample went through the full order pipeline.
  const sponsoredPost = await pg.query<{ id: string }>("select id from public.posts where type = 'sponsored' limit 1");
  const order = await pg.query<{ id: string }>(
    `insert into public.sponsored_orders (sponsor_id, post_id, title, brief, amount, currency, status, vetting_checklist, invoice_status, created_by)
     values ($1, $2, 'Cross-border payments explainer', 'Fictional sample order.', 1500, 'USD', 'vetting', $3, 'paid', $4)
     returning id`,
    [
      sponsor.rows[0]!.id,
      sponsoredPost.rows[0]!.id,
      JSON.stringify(Object.fromEntries(["identity_verified", "regulatory_status_checked", "no_guaranteed_returns", "links_scanned", "disclosure_agreed", "payment_terms_agreed"].map((k) => [k, true]))),
      userIds["tunde"],
    ],
  );
  for (const status of ["accepted", "in_production", "published"]) {
    await pg.query("update public.sponsored_orders set status = $2::public.sponsored_order_status where id = $1", [order.rows[0]!.id, status]);
  }

  await pg.query(
    `insert into public.blocked_domains (domain, reason, added_by) values
       ('fake-exchange.example', 'Fictional sample: impersonates a crypto exchange', $1),
       ('free-airdrop.example', 'Fictional sample: wallet-draining airdrop', $1)`,
    [userIds["tunde"]],
  );

  // A live, approved end-of-article ad from the fictional sponsor.
  await pg.query(
    `insert into public.ad_bookings (slot_id, sponsor_id, starts_at, ends_at, creative_url, click_url, alt_text, approved)
     select id, $1, now() - interval '1 day', now() + interval '365 days', '/sample/ad-examplepay.svg',
            'https://example.com/', 'ExamplePay: send money home for less (fictional sample ad)', true
     from public.ad_slots where key = 'article-end'`,
    [sponsor.rows[0]!.id],
  );

  // Writer payouts at each stage (fictional amounts). Inserted as pending, then moved through
  // the life cycle so the guard trigger and audit log see the same steps an admin would take.
  const payStages: Array<[string, string, string, string[]]> = [
    ["amara", "120.00", "USD", ["approved", "paid"]],
    ["amara", "45000.00", "NGN", ["approved"]],
    ["kwame", "95.00", "USD", []],
  ];
  for (const [i, [author, amount, currency, steps]] of payStages.entries()) {
    const post = await pg.query<{ id: string }>(
      `select id from public.posts where author_id = $1 and status = 'published'
       order by published_at desc offset $2 limit 1`,
      [userIds[author], i === 1 ? 1 : 0],
    );
    if (!post.rows[0]) continue;
    const pay = await pg.query<{ id: string }>(
      "insert into public.writer_payments (writer_id, post_id, amount, currency) values ($1, $2, $3, $4) returning id",
      [userIds[author], post.rows[0].id, amount, currency],
    );
    for (const s of steps) {
      await pg.query("update public.writer_payments set status = $2::public.payment_status where id = $1", [pay.rows[0]!.id, s]);
    }
  }

  // Sample events and opportunities (fictional). Inserted directly, so the publishing guard (which
  // checks for a signed-in editor) is switched off for these statements.
  const day = 86_400_000;
  const when = (d: number) => new Date(Date.now() + d * day).toISOString();
  await pg.exec("alter table public.listings disable trigger listings_guard");
  const listings: Array<[string, string, string, string, string, string | null, string | null, string | null, boolean, string | null]> = [
    ["event", "conference", "Lagos Blockchain Summit (sample)", "lagos-blockchain-summit", "Sample event: two days of talks for builders, founders and regulators.", when(12), when(13), "Lagos, Nigeria", false, null],
    ["event", "online", "Stablecoins 101 live class (sample)", "stablecoins-101-live-class", "Sample event: a free one-hour online class on how stablecoins work.", when(5), null, null, true, null],
    ["event", "meetup", "Nairobi crypto meetup (sample)", "nairobi-crypto-meetup", "Sample event: a past community meetup for developers in Nairobi.", when(-20), when(-20), "Nairobi, Kenya", false, null],
    ["opportunity", "grant", "Payments builder grant (sample)", "payments-builder-grant", "Sample opportunity: funding for teams building cross-border payments in Africa.", null, when(30), "Builders in Africa", true, "Up to $10,000"],
    ["opportunity", "airdrop", "Testnet points airdrop (sample)", "testnet-points-airdrop", "Sample opportunity: earn points by using a project's testnet before the deadline.", null, when(-3), "Everyone", true, "Token allocation"],
  ];
  for (const [kind, category, title, slug, summary, starts, ends, location, online, reward] of listings) {
    await pg.query(
      `insert into public.listings (kind, category, title, slug, summary, details, url, starts_at, ends_at, location, is_online, reward,
         organizer, status, safety_checked, checked_at, checked_by, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, 'https://example.com/', $7, $8, $9, $10, $11, 'Example Org (fictional)', 'published',
         $12, case when $12 then now() end, case when $12 then $13::uuid end, now(), $13)`,
      [kind, category, title, slug, summary, "Fictional sample listing for development and tests.\n\nNothing here is real.", starts, ends, location, online, reward,
       kind === "opportunity", userIds["tunde"]],
    );
  }
  await pg.exec("alter table public.listings enable trigger listings_guard");

  // Seeded rows were inserted at "now"; backdate updated_at to match publish times.
  // The updated_at trigger would stamp "now", so switch it off for this one statement.
  await pg.exec(`
    alter table public.posts disable trigger posts_updated_at;
    update public.posts set updated_at = coalesce(published_at, created_at);
    alter table public.posts enable trigger posts_updated_at;
  `);
}
