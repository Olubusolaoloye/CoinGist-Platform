import { slugify } from "@coingist/types";
import type { AiProvider, AiTask, AiTasks } from "./provider.js";

/**
 * Built-in stand-in for local development, tests and the demo (no API key, no network).
 * It only rearranges the writer's own words, so it never invents facts; Studio labels its
 * output as a sample.
 */
export function createOfflineProvider(): AiProvider {
  const sentences = (text: string) =>
    text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
  const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

  const handlers: { [K in AiTask]: (input: AiTasks[K]["input"]) => AiTasks[K]["output"] } = {
    outline: ({ notes, text }) => {
      const points = sentences(`${notes} ${text}`);
      const take = (i: number) => points.slice(i * 2, i * 2 + 2);
      return {
        sections: [
          { heading: "What happened", points: take(0).length ? take(0) : ["[CHECK: the core news, with a source]"] },
          { heading: "Why it matters for readers in Africa", points: take(1).length ? take(1) : ["[CHECK: local impact]"] },
          { heading: "What people are saying", points: take(2).length ? take(2) : ["[CHECK: a named source or two]"] },
          { heading: "What to watch next", points: take(3).length ? take(3) : ["[CHECK: dates or decisions coming up]"] },
        ],
        openQuestions: ["Who is the primary source for the main claim?", "Are there local figures (users, volumes, fees) we can cite?"],
      };
    },
    draft: ({ notes }) => {
      const s = sentences(notes);
      const paragraphs: string[] = [];
      for (let i = 0; i < s.length; i += 2) paragraphs.push(s.slice(i, i + 2).join(" "));
      return {
        paragraphs: paragraphs.length ? paragraphs : ["[CHECK: add notes to draft from]"],
        toVerify: s.filter((x) => /\d/.test(x)).slice(0, 6),
      };
    },
    gist: ({ text }) => ({ bullets: sentences(text).slice(0, 3).map((s) => clip(s, 160)) }),
    seo: ({ title, excerpt, text }) => {
      const first = sentences(text)[0] ?? title;
      return {
        seoTitle: clip(title, 60),
        seoDescription: clip(excerpt || first, 155),
        slug: slugify(title).split("-").slice(0, 7).join("-"),
        excerpt: clip(first, 200),
      };
    },
    repurpose: ({ format, title, text, url }) => {
      const s = sentences(text);
      if (format === "x_thread") {
        return { posts: [clip(title, 270), ...s.slice(0, 3).map((x) => clip(x, 270)), `Read the full story: ${url}`] };
      }
      if (format === "telegram") return { posts: [[title, "", ...s.slice(0, 2), "", url].join("\n")] };
      return { posts: [`${s.slice(0, 2).join(" ")} Read the story for the full picture.`] };
    },
    claims: ({ text }) => ({
      claims: sentences(text)
        .filter((s) => /\d|%|\b(biggest|largest|first|record|always|never|everyone|will)\b/i.test(s))
        .slice(0, 5)
        .map((quote) => ({
          quote,
          issue: /\d|%/.test(quote) ? "A figure without a named source." : "A strong claim that needs support.",
          suggestion: "Attribute it to a source, or soften it.",
        })),
    }),
    trending: ({ headlines, covered, notes }) => {
      const items = headlines.length ? headlines : sentences(notes).map((n) => ({ title: n, link: "", source: "notes" }));
      return {
        topics: items.slice(0, 5).map((h) => {
          const w = words(h.title);
          const match = covered.find((c) => [...words(c.title)].filter((x) => w.has(x)).length >= 2);
          return {
            title: clip(h.title, 90),
            whyItMatters: "[Sample] Connect AI assist to get a real summary of why this matters.",
            angle: "[Sample] What it means for readers and businesses in Africa.",
            suggestedHeadline: clip(h.title, 90),
            sourceLinks: h.link ? [h.link] : [],
            coveredById: match?.id ?? null,
          };
        }),
      };
    },
  };

  return {
    name: "offline",
    model: null,
    async run<K extends AiTask>(task: K, input: AiTasks[K]["input"]) {
      const output = (handlers[task] as (i: AiTasks[K]["input"]) => AiTasks[K]["output"])(input);
      return { output, model: null, inputTokens: 0, outputTokens: 0 };
    },
  };
}
