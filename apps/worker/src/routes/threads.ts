import type { Context, Handler } from "hono";
import type { AppEnv } from "../lib/env";

async function proxyToVps(
  c: Context<AppEnv>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const target = `${c.env.VPS_ORIGIN}${path}`;
  const headers = new Headers(init.headers);
  headers.set("x-internal-token", c.env.INTERNAL_WORKER_TO_VPS);
  headers.set("x-user-id", c.var.session.sub);

  let upstream: Response;
  try {
    upstream = await fetch(target, { ...init, headers });
  } catch (err) {
    return c.json({ error: `upstream fetch failed: ${stringifyError(err)}` }, 502);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export const listThreads: Handler<AppEnv> = (c) => proxyToVps(c, "/api/threads");

export const createThread: Handler<AppEnv> = (c) =>
  proxyToVps(c, "/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

export const getThreadMessages: Handler<AppEnv> = (c) => {
  const threadId = c.req.param("id") ?? "";
  return proxyToVps(c, `/api/threads/${encodeURIComponent(threadId)}/messages`);
};

export const stopThread: Handler<AppEnv> = (c) => {
  const threadId = c.req.param("id") ?? "";
  return proxyToVps(c, `/api/threads/${encodeURIComponent(threadId)}/stop`, {
    method: "POST",
  });
};

export const getThreadStream: Handler<AppEnv> = async (c) => {
  const threadId = c.req.param("id") ?? "";
  const target = `${c.env.VPS_ORIGIN}/api/threads/${encodeURIComponent(threadId)}/stream`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        accept: "text/event-stream",
        "x-internal-token": c.env.INTERNAL_WORKER_TO_VPS,
        "x-user-id": c.var.session.sub,
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (err) {
    return c.json({ error: `upstream fetch failed: ${stringifyError(err)}` }, 502);
  }

  if (upstream.status === 404) {
    return c.json({ error: "no active stream" }, 404);
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "<no body>");
    return c.json({ error: `upstream ${upstream.status}: ${detail.slice(0, 500)}` }, 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
};

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
