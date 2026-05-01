import { describe, expect, it } from "vitest";
import app from "../../index";
import { makeKvMock, makeTestEnv } from "../../lib/test-helpers";

describe("/auth/*", () => {
  describe("registration code gate", () => {
    it("rejects /auth/register/options without X-Registration-Code", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/register/options",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "abdi", displayName: "Abdi" }),
        },
        env,
      );
      expect(res.status).toBe(403);
    });

    it("rejects /auth/register/options with wrong code", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/register/options",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-registration-code": "wrong-code",
          },
          body: JSON.stringify({ name: "abdi", displayName: "Abdi" }),
        },
        env,
      );
      expect(res.status).toBe(403);
    });

    it("accepts /auth/register/options with valid code and returns options + cookie", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/register/options",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-registration-code": env.REGISTRATION_CODE,
          },
          body: JSON.stringify({ name: "abdi", displayName: "Abdi" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(typeof body.challenge).toBe("string");
      expect(body.rp).toMatchObject({ id: env.WEBAUTHN_RP_ID, name: env.WEBAUTHN_RP_NAME });
      expect(body.user).toBeDefined();
      expect(res.headers.get("set-cookie")).toMatch(/register_chal=/);
    });
  });

  describe("login options", () => {
    it("returns options with empty allowCredentials (discoverable)", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/login/options",
        { method: "POST" },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(typeof body.challenge).toBe("string");
      expect(body.rpId).toBe(env.WEBAUTHN_RP_ID);
      expect(body.allowCredentials).toEqual([]);
      expect(res.headers.get("set-cookie")).toMatch(/login_chal=/);
    });
  });

  describe("/auth/me", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/auth/me", { method: "GET" }, env);
      expect(res.status).toBe(401);
    });
  });

  describe("/auth/logout", () => {
    it("returns ok and clears cookie", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/auth/logout", { method: "POST" }, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/sid=;/);
    });
  });
});
