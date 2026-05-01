import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOWED_TOOLS = ['Read', 'Write', 'Grep', 'Glob', 'Bash', 'WebSearch', 'Agent'];

export const MAIN_MODEL = 'claude-sonnet-4-6';

export const SUBAGENT_MODELS: Record<string, string> = {
  researcher: 'claude-haiku-4-5-20251001',
  'code-reviewer': 'claude-sonnet-4-6',
};

export const MAX_TURNS = 25;

export const GUARDRAIL_WARN_COST = 0.10;
export const GUARDRAIL_ERROR_COST = 0.25;
export const GUARDRAIL_WARN_CACHE_W = 18000;
export const GUARDRAIL_ERROR_CACHE_W = 30000;
