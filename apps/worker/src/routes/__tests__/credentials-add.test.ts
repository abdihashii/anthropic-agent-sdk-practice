import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../index";
import { signChallengeCookie, signSessionJwt } from "../../lib/crypto";
import { makeKvMock, makeTestEnv } from "../../lib/test-helpers";

const { generateRegistrationOptionsMock, verifyRegistrationResponseMock } =
  vi.hoisted(() => ({
    generateRegistrationOptionsMock: vi.fn(),
    verifyRegistrationResponseMock: vi.fn(),
  }));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: generateRegistrationOptionsMock,
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: verifyRegistrationResponseMock,
  verifyAuthenticationResponse: vi.fn(),
}));

const TEST_USER_ID = "u_existing";
const TEST_USER_RECORD = {
  name: "abdi",
  displayName: "Abdi",
  createdAt: "2026-01-01T00:00:00.000Z",
};

async function mintSidCookie(env: Env, sub: string = TEST_USER_ID): Promise<string> {
  const jwt = await signSessionJwt({ sub, kid: env.SESSION_KID }, env.SESSION_SIGNING_KEY);
  return `sid=${jwt}`;
}

async function mintAddChalCookie(
  env: Env,
  payload: { challenge: string; userId: string },
): Promise<string> {
  const jwt = await signChallengeCookie(
    { kind: "add", challenge: payload.challenge, userId: payload.userId },
    env.SESSION_SIGNING_KEY,
    300,
  );
  return `add_chal=${jwt}`;
}

beforeEach(() => {
  generateRegistrationOptionsMock.mockReset();
  verifyRegistrationResponseMock.mockReset();
});

describe("/auth/credentials/add/*", () => {
  describe("options", () => {
    it("rejects without sid cookie", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/credentials/add/options",
        { method: "POST" },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("uses default name/displayName when user record is missing (dev-login bootstrap path)", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      generateRegistrationOptionsMock.mockResolvedValue({
        challenge: "c",
        rp: { id: env.WEBAUTHN_RP_ID, name: env.WEBAUTHN_RP_NAME },
        user: { id: "encoded", name: "user", displayName: "user" },
        pubKeyCredParams: [],
      });

      const res = await app.request(
        "/auth/credentials/add/options",
        {
          method: "POST",
          headers: { cookie: await mintSidCookie(env) },
        },
        env,
      );
      expect(res.status).toBe(200);
      expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: "user",
          userDisplayName: "user",
        }),
      );
    });

    it("returns options + sets add_chal cookie scoped to current user", async () => {
      const kv = makeKvMock();
      await kv.put(`users:${TEST_USER_ID}`, JSON.stringify(TEST_USER_RECORD));
      const env = makeTestEnv({ kv });

      generateRegistrationOptionsMock.mockResolvedValue({
        challenge: "mock-challenge-abc",
        rp: { id: env.WEBAUTHN_RP_ID, name: env.WEBAUTHN_RP_NAME },
        user: { id: "encoded", name: TEST_USER_RECORD.name, displayName: TEST_USER_RECORD.displayName },
        pubKeyCredParams: [],
      });

      const res = await app.request(
        "/auth/credentials/add/options",
        {
          method: "POST",
          headers: { cookie: await mintSidCookie(env) },
        },
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.challenge).toBe("mock-challenge-abc");
      expect(res.headers.get("set-cookie")).toMatch(/add_chal=/);
      expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: env.WEBAUTHN_RP_NAME,
          rpID: env.WEBAUTHN_RP_ID,
          userName: TEST_USER_RECORD.name,
          userDisplayName: TEST_USER_RECORD.displayName,
        }),
      );
    });
  });

  describe("verify", () => {
    it("rejects without sid cookie", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("400s without add_chal cookie", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: await mintSidCookie(env),
          },
          body: "{}",
        },
        env,
      );
      expect(res.status).toBe(400);
    });

    it("rejects when challenge userId mismatches session", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      const sid = await mintSidCookie(env, TEST_USER_ID);
      const addChal = await mintAddChalCookie(env, {
        challenge: "abc",
        userId: "different-user",
      });
      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${sid}; ${addChal}`,
          },
          body: JSON.stringify({ id: "x", response: {} }),
        },
        env,
      );
      expect(res.status).toBe(401);
    });

    it("400s when verification fails", async () => {
      const env = makeTestEnv({ kv: makeKvMock() });
      verifyRegistrationResponseMock.mockResolvedValue({ verified: false });

      const sid = await mintSidCookie(env, TEST_USER_ID);
      const addChal = await mintAddChalCookie(env, {
        challenge: "abc",
        userId: TEST_USER_ID,
      });

      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${sid}; ${addChal}`,
          },
          body: JSON.stringify({ id: "x", response: {} }),
        },
        env,
      );
      expect(res.status).toBe(400);
    });

    it("happy path stores credential + index, doesn't rewrite existing user record", async () => {
      const kv = makeKvMock();
      await kv.put(`users:${TEST_USER_ID}`, JSON.stringify(TEST_USER_RECORD));
      const env = makeTestEnv({ kv });

      verifyRegistrationResponseMock.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: "test-credential-id",
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 0,
            transports: ["internal"],
          },
        },
      });

      const sid = await mintSidCookie(env, TEST_USER_ID);
      const addChal = await mintAddChalCookie(env, {
        challenge: "abc",
        userId: TEST_USER_ID,
      });

      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${sid}; ${addChal}`,
          },
          body: JSON.stringify({ id: "test-credential-id", response: {} }),
        },
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: true, credentialId: "test-credential-id" });

      const storedCred = await kv.get("creds:test-credential-id");
      expect(storedCred).not.toBeNull();
      const credParsed = JSON.parse(storedCred!) as { userId: string; counter: number };
      expect(credParsed.userId).toBe(TEST_USER_ID);
      expect(credParsed.counter).toBe(0);

      const indexEntry = await kv.get(`user_creds:${TEST_USER_ID}:test-credential-id`);
      expect(indexEntry).toBe("");

      expect(await kv.get(`users:${TEST_USER_ID}`)).toBe(JSON.stringify(TEST_USER_RECORD));
    });

    it("lazy-creates user record when missing (dev-login bootstrap path)", async () => {
      const kv = makeKvMock();
      const env = makeTestEnv({ kv });

      verifyRegistrationResponseMock.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: "boot-cred-id",
            publicKey: new Uint8Array([9, 9, 9]),
            counter: 0,
            transports: ["internal"],
          },
        },
      });

      const sid = await mintSidCookie(env, TEST_USER_ID);
      const addChal = await mintAddChalCookie(env, {
        challenge: "abc",
        userId: TEST_USER_ID,
      });

      const res = await app.request(
        "/auth/credentials/add/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${sid}; ${addChal}`,
          },
          body: JSON.stringify({ id: "boot-cred-id", response: {} }),
        },
        env,
      );

      expect(res.status).toBe(200);

      const userRaw = await kv.get(`users:${TEST_USER_ID}`);
      expect(userRaw).not.toBeNull();
      const userParsed = JSON.parse(userRaw!) as {
        name: string;
        displayName: string;
        createdAt: string;
      };
      expect(userParsed.name).toBe("user");
      expect(userParsed.displayName).toBe("user");
      expect(typeof userParsed.createdAt).toBe("string");
    });
  });
});
