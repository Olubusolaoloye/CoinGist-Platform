import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiDeclinedError, AiUnavailableError, type AiProvider, type AiTask, type AiTasks } from "./provider.js";
import { buildPrompt, EFFORT, OUTPUT_SCHEMAS, SYSTEM_PROMPT } from "./prompts.js";

export const DEFAULT_AI_MODEL = "claude-opus-5-5";

/**
 * Claude via the Anthropic SDK. Structured outputs guarantee the JSON shape; server-side
 * refusal fallbacks let another model finish a request the first one declines.
 */
export function createClaudeProvider(opts: { apiKey: string; model?: string | undefined; client?: Anthropic }): AiProvider {
  const model = opts.model || DEFAULT_AI_MODEL;
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: 90_000, maxRetries: 1 });

  return {
    name: "claude",
    model,
    async run<K extends AiTask>(task: K, input: AiTasks[K]["input"]) {
      let res;
      try {
        res = await client.beta.messages.parse({
          model,
          max_tokens: 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          output_config: { effort: EFFORT[task], format: betaZodOutputFormat(OUTPUT_SCHEMAS[task]) },
          messages: [{ role: "user", content: buildPrompt(task, input) }],
        });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError("AI assist is busy. Try again in a minute.");
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          console.error("ai: the Anthropic API key was rejected", err.status);
          throw new AiUnavailableError("AI assist isn't set up correctly. Tell an admin.");
        }
        if (err instanceof Anthropic.APIError) {
          console.error(`ai: ${task} failed`, err.status, err.message);
          throw new AiUnavailableError();
        }
        console.error(`ai: ${task} failed`, err);
        throw new AiUnavailableError();
      }
      if (res.stop_reason === "refusal") throw new AiDeclinedError();
      if (res.stop_reason === "max_tokens" || !res.parsed_output) {
        console.error(`ai: ${task} returned no usable output (${res.stop_reason})`);
        throw new AiUnavailableError("The assistant's answer was incomplete. Try again, or with less text.");
      }
      return {
        output: res.parsed_output as AiTasks[K]["output"],
        model: res.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    },
  };
}
