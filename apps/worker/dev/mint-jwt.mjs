#!/usr/bin/env node
// Mints a 30-day session JWT signed with SESSION_SIGNING_KEY for local /api/chat smoke testing.
// Usage: SESSION_SIGNING_KEY=... node dev/mint-jwt.mjs [userId]

import { createHmac } from "node:crypto";

const SECRET = process.env.SESSION_SIGNING_KEY;
if (!SECRET) {
  console.error("SESSION_SIGNING_KEY not set");
  process.exit(1);
}

const sub = process.argv[2] ?? "test-user";
const kid = process.env.SESSION_KID ?? "v1";

const now = Math.floor(Date.now() / 1000);
const payload = { sub, kid, iat: now, exp: now + 60 * 60 * 24 * 30 };
const header = { alg: "HS256", typ: "JWT" };

const headerB64 = base64url(JSON.stringify(header));
const payloadB64 = base64url(JSON.stringify(payload));
const signature = createHmac("sha256", SECRET).update(`${headerB64}.${payloadB64}`).digest();
const signatureB64 = base64url(signature);

console.log(`${headerB64}.${payloadB64}.${signatureB64}`);

function base64url(input) {
  const b64 = Buffer.isBuffer(input)
    ? input.toString("base64")
    : Buffer.from(input).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
