import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionJwt } from "../crypto";
import app from "../index";
import { makeKvMock, makeTestEnv } from "./helpers";

describe("POST /api/chat", () => {
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

  async function sessionCookie(env: Env) {
    const jwt = await signSessionJwt({ sub: "user-1", kid: "v1" }, env.SESSION_SIGNING_KEY);
    return `sid=${jwt}`;
  }

  it("rejects requests without session cookie", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request(
      "/api/chat",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects token signed with a different secret", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const stale = await signSessionJwt({ sub: "user-1", kid: "v1" }, "different-secret-32-bytes-pad!!!");
    const res = await app.request(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `sid=${stale}` },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("forwards to VPS with INTERNAL_WORKER_TO_VPS and streams the body back", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const sseBody = "event: chunk\ndata: {\"text\":\"hi\"}\n\nevent: done\ndata: {}\n\n";
    fetchMock.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const res = await app.request(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await sessionCookie(env) },
        body: '{"text":"hi"}',
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(sseBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://upstream.test/api/chat");
    const headers = new Headers(init.headers);
    expect(headers.get("x-internal-token")).toBe(env.INTERNAL_WORKER_TO_VPS);
    expect(headers.get("accept")).toBe("text/event-stream");
  });

  it("returns an SSE error frame on upstream non-2xx", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    fetchMock.mockResolvedValueOnce(new Response("upstream busted", { status: 502 }));
    const res = await app.request(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await sessionCookie(env) },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toMatch(/event: error/);
    expect(body).toMatch(/upstream 502/);
  });
});
