import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { timingSafeEqualHashed, verifySessionJwt } from "./crypto";
import type { AppEnv } from "./env";

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, "sid");
  if (!token) return c.json({ error: "no session" }, 401);
  const payload = await verifySessionJwt(token, c.env.SESSION_SIGNING_KEY);
  if (!payload) return c.json({ error: "invalid session" }, 401);
  c.set("session", payload);
  await next();
};

export function requireHeaderToken(headerName: string, expected: keyof Env): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const provided = c.req.header(headerName);
    if (!provided) return c.json({ error: "missing token" }, 401);
    const ok = await timingSafeEqualHashed(provided, c.env[expected] as string);
    if (!ok) return c.json({ error: "bad token" }, 401);
    await next();
  };
}

type Env = AppEnv["Bindings"];
