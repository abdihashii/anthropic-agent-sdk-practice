import { describe, expect, it } from 'vitest';
import type { RouterDecision } from '../model-router.js';
import { buildTaskLogRow, type SdkModelUsage } from '../task-logs.js';

const sonnetDecision: RouterDecision = {
  tier: 'sonnet',
  reason: 'multi-step task',
  costUSD: 0.0003,
  fallback: false,
};

const fallbackDecision: RouterDecision = {
  tier: 'sonnet',
  reason: 'classifier timed out',
  costUSD: 0,
  fallback: true,
};

const sonnetUsage: SdkModelUsage = {
  inputTokens: 4123,
  outputTokens: 287,
  cacheReadInputTokens: 1820,
  cacheCreationInputTokens: 64,
  costUSD: 0.0512,
};

const haikuUsage: SdkModelUsage = {
  inputTokens: 1500,
  outputTokens: 220,
  cacheReadInputTokens: 800,
  cacheCreationInputTokens: 0,
  costUSD: 0.0093,
};

describe('buildTaskLogRow', () => {
  it('persists a single-model server turn with no tools', () => {
    const row = buildTaskLogRow({
      threadId: 'thread-1',
      source: 'server',
      decision: sonnetDecision,
      modelUsage: { 'claude-sonnet-4-6': sonnetUsage },
      totalCostUSD: 0.0515,
      toolCallCount: 0,
      toolErrorCount: 0,
      subagentCount: 0,
      numTurns: 1,
      latencyMs: 4321,
    });

    expect(row.thread_id).toBe('thread-1');
    expect(row.source).toBe('server');
    expect(row.tier).toBe('sonnet');
    expect(row.classifier_fallback).toBe(false);
    expect(row.classifier_cost_usd).toBe(0.0003);
    expect(row.total_cost_usd).toBe(0.0515);
    expect(row.model_usage).toHaveLength(1);
    expect(row.model_usage[0]).toEqual({
      model_id: 'claude-sonnet-4-6',
      cost_usd: 0.0512,
      input_tokens: 4123,
      output_tokens: 287,
      cache_read_tokens: 1820,
      cache_write_tokens: 64,
    });
    expect(row.input_tokens).toBe(4123);
    expect(row.output_tokens).toBe(287);
    expect(row.cache_read_tokens).toBe(1820);
    expect(row.cache_write_tokens).toBe(64);
    expect(row.tool_call_count).toBe(0);
    expect(row.tool_error_count).toBe(0);
    expect(row.subagent_count).toBe(0);
    expect(row.num_turns).toBe(1);
    expect(row.latency_ms).toBe(4321);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sums tokens across multiple models on a subagent turn', () => {
    const row = buildTaskLogRow({
      threadId: 'thread-2',
      source: 'server',
      decision: sonnetDecision,
      modelUsage: {
        'claude-sonnet-4-6': sonnetUsage,
        'claude-haiku-4-5': haikuUsage,
      },
      totalCostUSD: 0.0608,
      toolCallCount: 3,
      toolErrorCount: 0,
      subagentCount: 1,
      numTurns: 2,
      latencyMs: 9100,
    });

    expect(row.model_usage).toHaveLength(2);
    expect(row.input_tokens).toBe(4123 + 1500);
    expect(row.output_tokens).toBe(287 + 220);
    expect(row.cache_read_tokens).toBe(1820 + 800);
    expect(row.cache_write_tokens).toBe(64 + 0);
    expect(row.subagent_count).toBe(1);
    expect(row.tool_call_count).toBe(3);
  });

  it('captures classifier fallback flag and zero classifier cost', () => {
    const row = buildTaskLogRow({
      threadId: 'thread-3',
      source: 'server',
      decision: fallbackDecision,
      modelUsage: { 'claude-sonnet-4-6': sonnetUsage },
      totalCostUSD: 0.0512,
      toolCallCount: 0,
      toolErrorCount: 0,
      subagentCount: 0,
      numTurns: 1,
      latencyMs: 5000,
    });

    expect(row.classifier_fallback).toBe(true);
    expect(row.classifier_cost_usd).toBe(0);
    expect(row.tier).toBe('sonnet');
  });

  it('persists tool_call_count and tool_error_count independently', () => {
    const row = buildTaskLogRow({
      threadId: 'thread-4',
      source: 'server',
      decision: sonnetDecision,
      modelUsage: { 'claude-sonnet-4-6': sonnetUsage },
      totalCostUSD: 0.0515,
      toolCallCount: 5,
      toolErrorCount: 2,
      subagentCount: 0,
      numTurns: 1,
      latencyMs: 6500,
    });

    expect(row.tool_call_count).toBe(5);
    expect(row.tool_error_count).toBe(2);
  });

  it('passes through null thread_id and source=cli for CLI turns', () => {
    const row = buildTaskLogRow({
      threadId: null,
      source: 'cli',
      decision: sonnetDecision,
      modelUsage: { 'claude-sonnet-4-6': sonnetUsage },
      totalCostUSD: 0.0515,
      toolCallCount: 1,
      toolErrorCount: 0,
      subagentCount: 0,
      numTurns: 1,
      latencyMs: 3000,
    });

    expect(row.thread_id).toBeNull();
    expect(row.source).toBe('cli');
  });
});
