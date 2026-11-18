import type {
  AiClaims,
  AiDraft,
  AiGist,
  AiOutline,
  AiRepurpose,
  AiSeo,
  RepurposeFormat,
  TrendingHeadline,
} from "@coingist/types";

/** What each AI task receives (already validated) and must return. */
export interface AiTasks {
  outline: { input: { title: string; notes: string; text: string }; output: AiOutline };
  draft: { input: { title: string; notes: string; text: string }; output: AiDraft };
  gist: { input: { title: string; text: string }; output: AiGist };
  seo: { input: { title: string; excerpt: string; text: string }; output: AiSeo };
  repurpose: { input: { format: RepurposeFormat; title: string; text: string; url: string }; output: Omit<AiRepurpose, "format"> };
  claims: { input: { title: string; text: string }; output: AiClaims };
  trending: {
    input: { headlines: TrendingHeadline[]; covered: Array<{ id: string; title: string }>; notes: string };
    output: {
      topics: Array<{
        title: string;
        whyItMatters: string;
        angle: string;
        suggestedHeadline: string;
        sourceLinks: string[];
        coveredById: string | null;
      }>;
    };
  };
}
export type AiTask = keyof AiTasks;

export interface AiRun<T> {
  output: T;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Something that can do the AI tasks: Claude in production, or the built-in offline generator
 * (deterministic, extractive, no network) for local development, tests and demos.
 */
export interface AiProvider {
  readonly name: "claude" | "offline";
  readonly model: string | null;
  run<K extends AiTask>(task: K, input: AiTasks[K]["input"]): Promise<AiRun<AiTasks[K]["output"]>>;
}

/** The model declined the request (safety); nothing was generated. */
export class AiDeclinedError extends Error {
  constructor(message = "The assistant declined this request.") {
    super(message);
    this.name = "AiDeclinedError";
  }
}

/** The AI service is unreachable, overloaded or returned something unusable. */
export class AiUnavailableError extends Error {
  constructor(message = "AI assist isn't available right now. Try again in a minute.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}
