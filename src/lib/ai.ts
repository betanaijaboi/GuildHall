import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Guildhall's Claude helper. Structured outputs (Zod) so callers get validated objects, and
 * server-side refusal fallbacks ("default" routing) so a declined request is retried on
 * Anthropic's recommended model instead of failing.
 */
export const AI_MODEL = process.env.GUILDHALL_AI_MODEL ?? "claude-opus-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;

export async function aiParse<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S> | null> {
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    return (response.parsed_output as z.infer<S> | null) ?? null;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.warn("Claude rate limited; skipping AI step");
    else if (error instanceof Anthropic.APIError) console.warn(`Claude API error ${error.status}: ${error.message}`);
    else throw error;
    return null;
  }
}
