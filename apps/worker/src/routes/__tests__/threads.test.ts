import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionJwt } from "../../lib/crypto";
import app from "../../index";
import { makeKvMock, makeTestEnv } from "../../lib/test-helpers";

describe("/api/threads*", () => {
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

  describe("GET /api/threads", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/api/threads", { method: "GET" }, env);
      expect(res.status).toBe(401);
    });

    it("forwards to VPS with x-internal-token + x-user-id and returns body", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const upstreamBody = JSON.stringify({ threads: [] });
      fetchMock.mockResolvedValueOnce(
        new Response(upstreamBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads",
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
      expect(String(url)).toBe("https://upstream.test/api/threads");
      const headers = new Headers(init.headers);
      expect(headers.get("x-internal-token")).toBe(env.INTERNAL_WORKER_TO_VPS);
      expect(headers.get("x-user-id")).toBe("user-42");
    });
  });

  describe("POST /api/threads", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/api/threads", { method: "POST" }, env);
      expect(res.status).toBe(401);
    });

    it("forwards to VPS with empty body and returns created thread", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const upstreamBody = JSON.stringify({
        id: "t-123",
        title: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      });
      fetchMock.mockResolvedValueOnce(
        new Response(upstreamBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads",
        {
          method: "POST",
          headers: { cookie: await sessionCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe(upstreamBody);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe("{}");
      const headers = new Headers(init.headers);
      expect(headers.get("x-user-id")).toBe("user-1");
    });
  });

  describe("GET /api/threads/:id/messages", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/api/threads/abc/messages", { method: "GET" }, env);
      expect(res.status).toBe(401);
    });

    it("forwards thread id and user id to VPS", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads/thread-xyz/messages",
        {
          method: "GET",
          headers: { cookie: await sessionCookie(env, "user-9") },
        },
        env,
      );

      expect(res.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(String(url)).toBe("https://upstream.test/api/threads/thread-xyz/messages");
      const headers = new Headers(init.headers);
      expect(headers.get("x-user-id")).toBe("user-9");
    });

    it("returns 502 when upstream fetch fails", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const res = await app.request(
        "/api/threads/abc/messages",
        {
          method: "GET",
          headers: { cookie: await sessionCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(502);
    });
  });

  describe("POST /api/threads/:id/stop", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/api/threads/abc/stop",
        { method: "POST" },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("forwards POST with x-internal-token + x-user-id and returns body", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads/thr-1/stop",
        {
          method: "POST",
          headers: { cookie: await sessionCookie(env, "user-7") },
        },
        env,
      );

      expect(res.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(String(url)).toBe("https://upstream.test/api/threads/thr-1/stop");
      expect(init.method).toBe("POST");
      const headers = new Headers(init.headers);
      expect(headers.get("x-internal-token")).toBe(env.INTERNAL_WORKER_TO_VPS);
      expect(headers.get("x-user-id")).toBe("user-7");
    });

    it("propagates upstream 404 when no active stream", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "no active stream" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads/thr-1/stop",
        {
          method: "POST",
          headers: { cookie: await sessionCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/threads/:id/stream", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/api/threads/abc/stream",
        { method: "GET" },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("forwards GET with x-internal-token + x-user-id and returns SSE body", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const sseBody = "event: started\ndata: {\"thread_id\":\"thr-1\"}\n\n";
      fetchMock.mockResolvedValueOnce(
        new Response(sseBody, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );

      const res = await app.request(
        "/api/threads/thr-1/stream",
        {
          method: "GET",
          headers: { cookie: await sessionCookie(env, "user-9") },
        },
        env,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      expect(await res.text()).toBe(sseBody);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(String(url)).toBe("https://upstream.test/api/threads/thr-1/stream");
      const headers = new Headers(init.headers);
      expect(headers.get("x-user-id")).toBe("user-9");
    });

    it("returns 404 when upstream has no active stream", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "no active stream" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );

      const res = await app.request(
        "/api/threads/thr-1/stream",
        {
          method: "GET",
          headers: { cookie: await sessionCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(404);
    });

    it("returns 502 when upstream fetch fails", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const res = await app.request(
        "/api/threads/abc/stream",
        {
          method: "GET",
          headers: { cookie: await sessionCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(502);
    });
  });
});
