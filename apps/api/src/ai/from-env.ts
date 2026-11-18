import type { Env } from "../env.js";
import type { AiDeps } from "../routes/ai.js";
import { createClaudeProvider } from "./claude.js";
import { createOfflineProvider } from "./offline.js";

/**
 * Claude when ANTHROPIC_API_KEY is set. Without a key: off in production (Studio says so),
 * the offline sample generator elsewhere.
 */
export function aiDepsFromEnv(env: Env): AiDeps | undefined {
  const production = process.env["NODE_ENV"] === "production";
  if (!env.ANTHROPIC_API_KEY && production) return undefined;
  return {
    provider: env.ANTHROPIC_API_KEY ? createClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL }) : createOfflineProvider(),
    dailyLimits: { writer: env.AI_DAILY_LIMIT_WRITER, editor: env.AI_DAILY_LIMIT_EDITOR, admin: env.AI_DAILY_LIMIT_EDITOR },
    trendingFeeds: env.TRENDING_FEEDS,
    siteUrl: env.SITE_URL,
  };
}
