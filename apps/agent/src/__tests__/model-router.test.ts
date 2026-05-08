import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classify } from '../model-router.js';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('classify()', () => {
  it('returns the parsed tier and reason on success', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"tier":"haiku","reason":"simple factual lookup"}' }],
      usage: { input_tokens: 200, output_tokens: 30 },
    });
    const result = await classify('what is the capital of france?');
    expect(result.tier).toBe('haiku');
    expect(result.reason).toBe('simple factual lookup');
    expect(result.fallback).toBe(false);
    expect(result.costUSD).toBeGreaterThan(0);
  });

  it('falls back to sonnet when JSON is malformed', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const result = await classify('test');
    expect(result.tier).toBe('sonnet');
    expect(result.fallback).toBe(true);
    expect(result.costUSD).toBe(0);
  });

  it('falls back when tier field is missing', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"reason":"missing tier"}' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const result = await classify('test');
    expect(result.tier).toBe('sonnet');
    expect(result.fallback).toBe(true);
  });

  it('falls back when tier value is unknown', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"tier":"mistral","reason":"unsupported"}' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const result = await classify('test');
    expect(result.tier).toBe('sonnet');
    expect(result.fallback).toBe(true);
  });

  it('falls back to sonnet when the classifier call times out', async () => {
    vi.useFakeTimers();
    mockCreate.mockImplementation((_params: unknown, opts: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const promise = classify('test');
    await vi.advanceTimersByTimeAsync(2500);
    const result = await promise;
    expect(result.tier).toBe('sonnet');
    expect(result.fallback).toBe(true);
    expect(result.costUSD).toBe(0);
    vi.useRealTimers();
  });
});
