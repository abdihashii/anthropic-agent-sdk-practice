import Anthropic from '@anthropic-ai/sdk';
import {
  CLASSIFIER_MAX_TOKENS,
  CLASSIFIER_MODEL,
  CLASSIFIER_TIMEOUT_MS,
  type RouterTier,
} from './agent-config.js';

export type { RouterTier } from './agent-config.js';

export interface RouterDecision {
  tier: RouterTier;
  reason: string;
  costUSD: number;
  fallback: boolean;
}

const TIER_VALUES: ReadonlySet<RouterTier> = new Set(['haiku', 'sonnet', 'opus']);

const SYSTEM_PROMPT = `You classify a single user prompt into one of three model tiers and explain why in <=12 words.

Tiers:
- "haiku": clearly trivial. Factual lookups (capitals, dates, definitions), short greetings, deterministic transforms (case changes, simple parsing), obvious classification. If unsure whether trivial, choose "sonnet" instead.
- "sonnet": the default. Coding, debugging, refactoring, multi-step reasoning, synthesis across sources, most chat. Choose this whenever ambiguous — it is the safe middle.
- "opus": only when the prompt explicitly involves architectural tradeoffs, formal reasoning, multi-document synthesis, hard math/logic, or high-stakes decisions where a wrong answer is costly. Phrases like "think hard", "walk me through tradeoffs", or "evaluate the design" are signals.

Cost asymmetry: routing too low (Haiku on a real question) gives bad answers — the worst outcome. Routing too high (Opus when Sonnet would do) costs ~5× — wasteful. Bad answers are worse than overspend. When uncertain, escalate to Sonnet, never down to Haiku.

Output ONLY a single-line JSON object. No prose, no markdown fences:
{"tier":"haiku|sonnet|opus","reason":"<=12 word reason>"}`;

// Haiku 4.5 pricing per million tokens, verified 2026-05-07.
// Source: https://platform.claude.com/docs/en/docs/about-claude/pricing
// Update both values together if Anthropic re-prices Haiku 4.5.
const HAIKU_45_INPUT_PER_M = 1.0;
const HAIKU_45_OUTPUT_PER_M = 5.0;

function classifierCostUSD(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_45_INPUT_PER_M) / 1_000_000 +
    (outputTokens * HAIKU_45_OUTPUT_PER_M) / 1_000_000
  );
}

function fallback(reason: string, kind: 'timeout' | 'network' | 'parse'): RouterDecision {
  process.stderr.write(
    `\x1b[33m[router] classifier failed (${kind}); defaulting to sonnet\x1b[0m\n`,
  );
  return { tier: 'sonnet', reason, costUSD: 0, fallback: true };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function classify(prompt: string): Promise<RouterDecision> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  let response;
  try {
    response = await getClient().messages.create(
      {
        model: CLASSIFIER_MODEL,
        max_tokens: CLASSIFIER_MAX_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || /abort/i.test(err.message));
    return fallback(
      'classifier failed — default',
      isAbort ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return fallback('classifier failed — default', 'parse');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text.trim());
  } catch {
    return fallback('classifier failed — default', 'parse');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('tier' in parsed) ||
    !('reason' in parsed)
  ) {
    return fallback('classifier failed — default', 'parse');
  }

  const { tier, reason } = parsed as { tier: unknown; reason: unknown };
  if (
    typeof tier !== 'string' ||
    !TIER_VALUES.has(tier as RouterTier) ||
    typeof reason !== 'string'
  ) {
    return fallback('classifier failed — default', 'parse');
  }

  return {
    tier: tier as RouterTier,
    reason,
    costUSD: classifierCostUSD(response.usage.input_tokens, response.usage.output_tokens),
    fallback: false,
  };
}
