import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionJwt } from "../../lib/crypto";
import app from "../../index";
import { makeKvMock, makeTestEnv } from "../../lib/test-helpers";

describe("GET /api/cost", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function sessionCookie(env: Env, sub = "user-1") {
    const jwt = await signSessionJwt({ sub, kid: "v1" }, env.SESSION_SIGNING_KEY);
    return `sid=${jwt}`;
  }

  it("rejects without session", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request("/api/cost", { method: "GET" }, env);
    expect(res.status).toBe(401);
  });

  it("forwards x-internal-token and does NOT send x-user-id", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const upstreamBody = JSON.stringify({
      window_days: 7,
      total_turns: 0,
      total_cost_usd: 0,
      cache_hit_ratio: 0,
      tool_success_rate: null,
      latency_p50_ms: null,
      latency_p95_ms: null,
      subagent_count_total: 0,
      classifier_fallback_rate: 0,
      weekly_by_model: [],
      tier_distribution: {},
    });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/cost",
      {
        method: "GET",
        headers: { cookie: await sessionCookie(env, "user-42") },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(upstreamBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://upstream.test/api/cost");
    const headers = new Headers(init.headers);
    expect(headers.get("x-internal-token")).toBe(env.INTERNAL_WORKER_TO_VPS);
    expect(headers.get("x-user-id")).toBeNull();
  });

  it("returns 502 when upstream fetch fails", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const res = await app.request(
      "/api/cost",
      {
        method: "GET",
        headers: { cookie: await sessionCookie(env) },
      },
      env,
    );

    expect(res.status).toBe(502);
  });
});
