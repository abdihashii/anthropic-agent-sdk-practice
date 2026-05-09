import type { Handler } from "hono";
import type { AppEnv } from "../lib/env";

export const getCost: Handler<AppEnv> = async (c) => {
  const target = `${c.env.VPS_ORIGIN}/api/cost`;
  const headers = new Headers();
  headers.set("x-internal-token", c.env.INTERNAL_WORKER_TO_VPS);

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `upstream fetch failed: ${msg}` }, 502);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
};
