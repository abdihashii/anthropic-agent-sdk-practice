import type { Handler } from "hono";
import { setCookie } from "hono/cookie";
import { signSessionJwt } from "../lib/crypto";
import type { AppEnv } from "../lib/env";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const devLogin: Handler<AppEnv> = async (c) => {
  const userId = c.env.DEFAULT_DEV_USER_ID;
  const jwt = await signSessionJwt(
    { sub: userId, kid: c.env.SESSION_KID },
    c.env.SESSION_SIGNING_KEY,
  );
  setCookie(c, "sid", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return c.json({ ok: true, userId });
};
