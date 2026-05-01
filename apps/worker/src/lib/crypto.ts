import { sign, verify } from "hono/utils/jwt/jwt";

export interface SessionPayload {
  sub: string;
  kid: string;
  iat: number;
  exp: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function timingSafeEqualHashed(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(new Uint8Array(da), new Uint8Array(db));
}

export async function signSessionJwt(
  input: { sub: string; kid: string },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: input.sub, kid: input.kid, iat: now, exp: now + SESSION_TTL_SECONDS },
    secret,
    "HS256",
  );
}

export async function verifySessionJwt(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  try {
    const decoded = (await verify(token, secret, "HS256")) as unknown as SessionPayload;
    if (
      typeof decoded?.sub !== "string" ||
      typeof decoded?.kid !== "string" ||
      typeof decoded?.iat !== "number" ||
      typeof decoded?.exp !== "number"
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function signChallengeCookie(
  payload: object,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...payload, iat: now, exp: now + ttlSeconds }, secret, "HS256");
}

export async function verifyChallengeCookie<T>(
  token: string,
  secret: string,
): Promise<(T & { iat: number; exp: number }) | null> {
  try {
    return (await verify(token, secret, "HS256")) as unknown as T & { iat: number; exp: number };
  } catch {
    return null;
  }
}
