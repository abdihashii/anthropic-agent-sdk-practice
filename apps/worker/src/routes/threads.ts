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

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
