import type { Handler } from "hono";
import type { AppEnv } from "../lib/env";

export const chatProxy: Handler<AppEnv> = async (c) => {
  const target = `${c.env.VPS_ORIGIN}/api/chat`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": c.req.header("content-type") ?? "application/json",
        "accept": "text/event-stream",
        "x-internal-token": c.env.INTERNAL_WORKER_TO_VPS,
        "x-user-id": c.var.session.sub,
      },
      body: c.req.raw.body,
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (err) {
    return sseErrorFrame(`upstream fetch failed: ${stringifyError(err)}`, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "<no body>");
    return sseErrorFrame(`upstream ${upstream.status}: ${detail.slice(0, 500)}`, upstream.status);
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

function sseErrorFrame(message: string, status: number): Response {
  const body = `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
