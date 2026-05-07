import { describe, expect, it } from "vitest";
import app from "../../index";
import { signSessionJwt } from "../../lib/crypto";
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

  describe("PATCH /auth/me", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/me",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Abdi" }),
        },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("400s on empty name", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/me",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: `sid=${jwt}`,
          },
          body: JSON.stringify({ name: "   " }),
        },
        env,
      );
      expect(res.status).toBe(400);
    });

    it("updates KV record + returns refreshed Me, preserving createdAt", async () => {
      const kv = makeKvMock();
      await kv.put(
        "users:u_test",
        JSON.stringify({
          name: "old",
          displayName: "old",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      );
      const env = makeTestEnv({ kv });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/me",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: `sid=${jwt}`,
          },
          body: JSON.stringify({ name: "  Abdirahman | Dude  " }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        userId: "u_test",
        name: "Abdirahman | Dude",
        displayName: "Abdirahman | Dude",
      });
      const stored = JSON.parse((await kv.get("users:u_test"))!);
      expect(stored).toEqual({
        name: "Abdirahman | Dude",
        displayName: "Abdirahman | Dude",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });

    it("lazy-creates the record when missing", async () => {
      const kv = makeKvMock();
      const env = makeTestEnv({ kv });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/me",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: `sid=${jwt}`,
          },
          body: JSON.stringify({ name: "Abdi" }),
        },
        env,
      );
      expect(res.status).toBe(200);
      const stored = JSON.parse((await kv.get("users:u_test"))!);
      expect(stored.name).toBe("Abdi");
      expect(stored.displayName).toBe("Abdi");
      expect(typeof stored.createdAt).toBe("string");
    });
  });

  describe("/auth/credentials", () => {
    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request("/auth/credentials", { method: "GET" }, env);
      expect(res.status).toBe(401);
    });

    it("returns the session user's credentials sorted newest-first", async () => {
      const kv = makeKvMock();
      const env = makeTestEnv({ kv });
      const sub = "u_test";

      await kv.put(
        "creds:cred-old",
        JSON.stringify({
          userId: sub,
          publicKey: "pk1",
          counter: 0,
          transports: ["internal"],
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      );
      await kv.put(`user_creds:${sub}:cred-old`, "");
      await kv.put(
        "creds:cred-new",
        JSON.stringify({
          userId: sub,
          publicKey: "pk2",
          counter: 0,
          transports: ["hybrid"],
          createdAt: "2026-05-01T00:00:00.000Z",
        }),
      );
      await kv.put(`user_creds:${sub}:cred-new`, "");
      await kv.put(
        "creds:other-user-cred",
        JSON.stringify({
          userId: "other-user",
          publicKey: "pk3",
          counter: 0,
          transports: ["internal"],
          createdAt: "2026-04-01T00:00:00.000Z",
        }),
      );
      await kv.put(`user_creds:other-user:other-user-cred`, "");

      const jwt = await signSessionJwt(
        { sub, kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/credentials",
        { method: "GET", headers: { cookie: `sid=${jwt}` } },
        env,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        credentials: Array<{ id: string; createdAt: string; transports: string[] | null }>;
      };
      expect(body.credentials.map((c) => c.id)).toEqual(["cred-new", "cred-old"]);
      expect(body.credentials[0].transports).toEqual(["hybrid"]);
    });
  });

  describe("DELETE /auth/credentials/:id", () => {
    async function seedCred(
      kv: KVNamespace,
      userId: string,
      credentialId: string,
      createdAt = "2026-05-01T00:00:00.000Z",
    ) {
      await kv.put(
        `creds:${credentialId}`,
        JSON.stringify({
          userId,
          publicKey: "pk",
          counter: 0,
          transports: ["internal"],
          createdAt,
        }),
      );
      await kv.put(`user_creds:${userId}:${credentialId}`, "");
    }

    it("rejects without session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/credentials/some-id",
        { method: "DELETE" },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("404s when credential doesn't exist", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/credentials/missing",
        { method: "DELETE", headers: { cookie: `sid=${jwt}` } },
        env,
      );
      expect(res.status).toBe(404);
    });

    it("404s when credential belongs to a different user", async () => {
      const kv = makeKvMock();
      await seedCred(kv, "other-user", "their-cred");
      const env = makeTestEnv({ kv });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/credentials/their-cred",
        { method: "DELETE", headers: { cookie: `sid=${jwt}` } },
        env,
      );
      expect(res.status).toBe(404);
    });

    it("400s when it's the last passkey", async () => {
      const kv = makeKvMock();
      await seedCred(kv, "u_test", "only-cred");
      const env = makeTestEnv({ kv });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/credentials/only-cred",
        { method: "DELETE", headers: { cookie: `sid=${jwt}` } },
        env,
      );
      expect(res.status).toBe(400);
      expect(await kv.get("creds:only-cred")).not.toBeNull();
    });

    it("deletes credential + index entry on happy path", async () => {
      const kv = makeKvMock();
      await seedCred(kv, "u_test", "cred-a", "2026-04-01T00:00:00.000Z");
      await seedCred(kv, "u_test", "cred-b", "2026-05-01T00:00:00.000Z");
      const env = makeTestEnv({ kv });
      const jwt = await signSessionJwt(
        { sub: "u_test", kid: env.SESSION_KID },
        env.SESSION_SIGNING_KEY,
      );
      const res = await app.request(
        "/auth/credentials/cred-a",
        { method: "DELETE", headers: { cookie: `sid=${jwt}` } },
        env,
      );
      expect(res.status).toBe(200);
      expect(await kv.get("creds:cred-a")).toBeNull();
      expect(await kv.get("user_creds:u_test:cred-a")).toBeNull();
      expect(await kv.get("creds:cred-b")).not.toBeNull();
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
