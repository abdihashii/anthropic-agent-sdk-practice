import { describe, expect, it } from "vitest";
import { verifySessionJwt } from "../../lib/crypto";
import app from "../../index";
import { makeKvMock, makeTestEnv } from "../../lib/test-helpers";

describe("POST /auth/dev-login", () => {
  it("rejects without X-Dev-Login-Token", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request(
      "/auth/dev-login",
      { method: "POST" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects with wrong token", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request(
      "/auth/dev-login",
      {
        method: "POST",
        headers: { "x-dev-login-token": "wrong-token" },
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("with valid token, sets sid cookie scoped to DEFAULT_DEV_USER_ID", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request(
      "/auth/dev-login",
      {
        method: "POST",
        headers: { "x-dev-login-token": env.DEV_LOGIN_TOKEN },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; userId: string };
    expect(body).toEqual({ ok: true, userId: env.DEFAULT_DEV_USER_ID });

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/sid=[^;]+/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);

    const sidMatch = setCookie?.match(/sid=([^;]+)/);
    expect(sidMatch).toBeTruthy();
    const payload = await verifySessionJwt(sidMatch![1], env.SESSION_SIGNING_KEY);
    expect(payload).toBeTruthy();
    expect(payload!.sub).toBe(env.DEFAULT_DEV_USER_ID);
    expect(payload!.kid).toBe(env.SESSION_KID);
  });
});
