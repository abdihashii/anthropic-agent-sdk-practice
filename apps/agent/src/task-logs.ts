import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { RouterDecision } from './model-router.js';

export interface ModelUsageEntry {
  model_id: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface TaskLogRow {
  id: string;
  thread_id: string | null;
  source: 'server' | 'cli';
  tier: 'haiku' | 'sonnet' | 'opus';
  classifier_fallback: boolean;
  model_usage: ModelUsageEntry[];
  total_cost_usd: number;
  classifier_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  tool_call_count: number;
  tool_error_count: number;
  subagent_count: number;
  num_turns: number;
  latency_ms: number;
}

export interface SdkModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface BuildTaskLogArgs {
  threadId: string | null;
  source: 'server' | 'cli';
  decision: RouterDecision;
  modelUsage: Record<string, SdkModelUsage>;
  totalCostUSD: number;
  toolCallCount: number;
  toolErrorCount: number;
  subagentCount: number;
  numTurns: number;
  latencyMs: number;
}

export function buildTaskLogRow(args: BuildTaskLogArgs): TaskLogRow {
  const entries: ModelUsageEntry[] = Object.entries(args.modelUsage).map(
    ([model_id, u]) => ({
      model_id,
      cost_usd: u.costUSD,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_read_tokens: u.cacheReadInputTokens,
      cache_write_tokens: u.cacheCreationInputTokens,
    }),
  );
  const sum = (k: keyof ModelUsageEntry): number =>
    entries.reduce((n, e) => n + (e[k] as number), 0);
  return {
    id: randomUUID(),
    thread_id: args.threadId,
    source: args.source,
    tier: args.decision.tier,
    classifier_fallback: args.decision.fallback,
    model_usage: entries,
    total_cost_usd: args.totalCostUSD,
    classifier_cost_usd: args.decision.costUSD,
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    cache_read_tokens: sum('cache_read_tokens'),
    cache_write_tokens: sum('cache_write_tokens'),
    tool_call_count: args.toolCallCount,
    tool_error_count: args.toolErrorCount,
    subagent_count: args.subagentCount,
    num_turns: args.numTurns,
    latency_ms: args.latencyMs,
  };
}

export async function writeTaskLog(
  pool: pg.Pool,
  row: TaskLogRow,
): Promise<void> {
  await pool.query(
    `INSERT INTO task_logs (
       id, thread_id, source, tier, classifier_fallback, model_usage,
       total_cost_usd, classifier_cost_usd, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, tool_call_count, tool_error_count,
       subagent_count, num_turns, latency_ms
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      row.id,
      row.thread_id,
      row.source,
      row.tier,
      row.classifier_fallback,
      JSON.stringify(row.model_usage),
      row.total_cost_usd,
      row.classifier_cost_usd,
      row.input_tokens,
      row.output_tokens,
      row.cache_read_tokens,
      row.cache_write_tokens,
      row.tool_call_count,
      row.tool_error_count,
      row.subagent_count,
      row.num_turns,
      row.latency_ms,
    ],
  );
}
