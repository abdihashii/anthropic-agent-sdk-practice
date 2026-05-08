import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOWED_TOOLS = ['Read', 'Write', 'Grep', 'Glob', 'Bash', 'WebSearch', 'Agent'];

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const SONNET_MODEL = 'claude-sonnet-4-6';
export const OPUS_MODEL = 'claude-opus-4-7';

export const SUBAGENT_MODELS: Record<string, string> = {
  researcher: HAIKU_MODEL,
  'code-reviewer': SONNET_MODEL,
};

export const MAX_TURNS = 25;

export const GUARDRAIL_WARN_COST = 0.10;
export const GUARDRAIL_ERROR_COST = 0.25;
export const GUARDRAIL_WARN_CACHE_W = 18000;
export const GUARDRAIL_ERROR_CACHE_W = 30000;

export type RouterTier = 'haiku' | 'sonnet' | 'opus';

export const TIER_MODELS: Record<RouterTier, string> = {
  haiku: HAIKU_MODEL,
  sonnet: SONNET_MODEL,
  opus: OPUS_MODEL,
};

export const CLASSIFIER_MODEL = HAIKU_MODEL;
export const CLASSIFIER_TIMEOUT_MS = 3000;
export const CLASSIFIER_MAX_TOKENS = 80;
