import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  signChallengeCookie,
  signSessionJwt,
  timingSafeEqualHashed,
  verifyChallengeCookie,
} from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { requireSession } from "../lib/middleware";

const CHALLENGE_TTL_SECONDS = 60 * 5;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

interface UserRecord {
  name: string;
  displayName: string;
  createdAt: string;
}

interface CredentialRecord {
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: string;
}

interface RegisterChallenge {
  kind: "register";
  challenge: string;
  userId: string;
  name: string;
  displayName: string;
}

interface LoginChallenge {
  kind: "login";
  challenge: string;
}

interface AddChallenge {
  kind: "add";
  challenge: string;
  userId: string;
}

const auth = new Hono<AppEnv>();

async function checkRegistrationCode(c: Context<AppEnv>): Promise<Response | null> {
  const provided = c.req.header("x-registration-code");
  if (!provided) return c.json({ error: "missing registration code" }, 403);
  const ok = await timingSafeEqualHashed(provided, c.env.REGISTRATION_CODE);
  if (!ok) return c.json({ error: "invalid registration code" }, 403);
  return null;
}

function setSessionCookie(c: Context<AppEnv>, jwt: string) {
  setCookie(c, "sid", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

auth.post("/register/options", async (c) => {
  const denial = await checkRegistrationCode(c);
  if (denial) return denial;

  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    displayName?: string;
  };
  const name = (body.name ?? "user").slice(0, 64);
  const displayName = (body.displayName ?? name).slice(0, 128);
  const userId = crypto.randomUUID();

  const options = await generateRegistrationOptions({
    rpName: c.env.WEBAUTHN_RP_NAME,
    rpID: c.env.WEBAUTHN_RP_ID,
    userID: isoUint8Array.fromUTF8String(userId),
    userName: name,
    userDisplayName: displayName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  const challengePayload: RegisterChallenge = {
    kind: "register",
    challenge: options.challenge,
    userId,
    name,
    displayName,
  };
  const cookieValue = await signChallengeCookie(
    challengePayload,
    c.env.SESSION_SIGNING_KEY,
    CHALLENGE_TTL_SECONDS,
  );
  setCookie(c, "register_chal", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/auth",
    maxAge: CHALLENGE_TTL_SECONDS,
  });

  return c.json(options);
});

auth.post("/register/verify", async (c) => {
  const denial = await checkRegistrationCode(c);
  if (denial) return denial;

  const cookie = getCookie(c, "register_chal");
  if (!cookie) return c.json({ error: "no challenge cookie" }, 400);
  const challengePayload = await verifyChallengeCookie<RegisterChallenge>(
    cookie,
    c.env.SESSION_SIGNING_KEY,
  );
  if (!challengePayload || challengePayload.kind !== "register") {
    return c.json({ error: "invalid challenge cookie" }, 400);
  }

  const body = (await c.req.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!body) return c.json({ error: "invalid body" }, 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: c.env.WEBAUTHN_ORIGIN,
      expectedRPID: c.env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    return c.json({ error: `verify failed: ${stringifyError(err)}` }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "verification failed" }, 400);
  }

  const credential = verification.registrationInfo.credential;
  const credentialId = credential.id;
  const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);
  const now = new Date().toISOString();

  const userRecord: UserRecord = {
    name: challengePayload.name,
    displayName: challengePayload.displayName,
    createdAt: now,
  };
  const credRecord: CredentialRecord = {
    userId: challengePayload.userId,
    publicKey: publicKeyB64,
    counter: credential.counter,
    transports: credential.transports as string[] | undefined,
    createdAt: now,
  };

  await c.env.WEBAUTHN_CREDS.put(userKey(challengePayload.userId), JSON.stringify(userRecord));
  await c.env.WEBAUTHN_CREDS.put(credKey(credentialId), JSON.stringify(credRecord));
  await c.env.WEBAUTHN_CREDS.put(userCredKey(challengePayload.userId, credentialId), "");

  deleteCookie(c, "register_chal", { path: "/auth" });

  const jwt = await signSessionJwt(
    { sub: challengePayload.userId, kid: c.env.SESSION_KID },
    c.env.SESSION_SIGNING_KEY,
  );
  setSessionCookie(c, jwt);

  return c.json({ ok: true, userId: challengePayload.userId });
});

auth.post("/login/options", async (c) => {
  const options = await generateAuthenticationOptions({
    rpID: c.env.WEBAUTHN_RP_ID,
    userVerification: "required",
    allowCredentials: [],
  });

  const challengePayload: LoginChallenge = {
    kind: "login",
    challenge: options.challenge,
  };
  const cookieValue = await signChallengeCookie(
    challengePayload,
    c.env.SESSION_SIGNING_KEY,
    CHALLENGE_TTL_SECONDS,
  );
  setCookie(c, "login_chal", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/auth",
    maxAge: CHALLENGE_TTL_SECONDS,
  });

  return c.json(options);
});

auth.post("/login/verify", async (c) => {
  const cookie = getCookie(c, "login_chal");
  if (!cookie) return c.json({ error: "no challenge cookie" }, 400);
  const challengePayload = await verifyChallengeCookie<LoginChallenge>(
    cookie,
    c.env.SESSION_SIGNING_KEY,
  );
  if (!challengePayload || challengePayload.kind !== "login") {
    return c.json({ error: "invalid challenge cookie" }, 400);
  }

  const body = (await c.req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body || typeof body.id !== "string") {
    return c.json({ error: "invalid body" }, 400);
  }

  const credId = body.id;
  const credRaw = await c.env.WEBAUTHN_CREDS.get(credKey(credId));
  if (!credRaw) return c.json({ error: "unknown credential" }, 401);
  const credRecord = JSON.parse(credRaw) as CredentialRecord;

  const userHandleB64 = body.response?.userHandle;
  if (userHandleB64) {
    const userHandle = isoUint8Array.toUTF8String(isoBase64URL.toBuffer(userHandleB64));
    if (userHandle !== credRecord.userId) {
      return c.json({ error: "user handle mismatch" }, 401);
    }
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: c.env.WEBAUTHN_ORIGIN,
      expectedRPID: c.env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
      credential: {
        id: credId,
        publicKey: isoBase64URL.toBuffer(credRecord.publicKey),
        counter: credRecord.counter,
        transports: credRecord.transports as never,
      },
    });
  } catch (err) {
    return c.json({ error: `verify failed: ${stringifyError(err)}` }, 401);
  }

  if (!verification.verified) {
    return c.json({ error: "verification failed" }, 401);
  }

  const newCounter = verification.authenticationInfo.newCounter;
  const updated: CredentialRecord = { ...credRecord, counter: newCounter };
  await c.env.WEBAUTHN_CREDS.put(credKey(credId), JSON.stringify(updated));

  deleteCookie(c, "login_chal", { path: "/auth" });

  const jwt = await signSessionJwt(
    { sub: credRecord.userId, kid: c.env.SESSION_KID },
    c.env.SESSION_SIGNING_KEY,
  );
  setSessionCookie(c, jwt);

  return c.json({ ok: true, userId: credRecord.userId });
});

auth.post("/credentials/add/options", requireSession, async (c) => {
  const session = c.var.session;
  const userRaw = await c.env.WEBAUTHN_CREDS.get(userKey(session.sub));
  const user = userRaw ? (JSON.parse(userRaw) as UserRecord) : null;

  const options = await generateRegistrationOptions({
    rpName: c.env.WEBAUTHN_RP_NAME,
    rpID: c.env.WEBAUTHN_RP_ID,
    userID: isoUint8Array.fromUTF8String(session.sub),
    userName: user?.name ?? "user",
    userDisplayName: user?.displayName ?? "user",
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  const challengePayload: AddChallenge = {
    kind: "add",
    challenge: options.challenge,
    userId: session.sub,
  };
  const cookieValue = await signChallengeCookie(
    challengePayload,
    c.env.SESSION_SIGNING_KEY,
    CHALLENGE_TTL_SECONDS,
  );
  setCookie(c, "add_chal", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/auth",
    maxAge: CHALLENGE_TTL_SECONDS,
  });

  return c.json(options);
});

auth.post("/credentials/add/verify", requireSession, async (c) => {
  const session = c.var.session;
  const cookie = getCookie(c, "add_chal");
  if (!cookie) return c.json({ error: "no challenge cookie" }, 400);
  const challengePayload = await verifyChallengeCookie<AddChallenge>(
    cookie,
    c.env.SESSION_SIGNING_KEY,
  );
  if (!challengePayload || challengePayload.kind !== "add") {
    return c.json({ error: "invalid challenge cookie" }, 400);
  }
  if (challengePayload.userId !== session.sub) {
    return c.json({ error: "challenge user mismatch" }, 401);
  }

  const body = (await c.req.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!body) return c.json({ error: "invalid body" }, 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: c.env.WEBAUTHN_ORIGIN,
      expectedRPID: c.env.WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    return c.json({ error: `verify failed: ${stringifyError(err)}` }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "verification failed" }, 400);
  }

  const credential = verification.registrationInfo.credential;
  const credentialId = credential.id;
  const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);
  const now = new Date().toISOString();

  const credRecord: CredentialRecord = {
    userId: session.sub,
    publicKey: publicKeyB64,
    counter: credential.counter,
    transports: credential.transports as string[] | undefined,
    createdAt: now,
  };

  await c.env.WEBAUTHN_CREDS.put(credKey(credentialId), JSON.stringify(credRecord));
  await c.env.WEBAUTHN_CREDS.put(userCredKey(session.sub, credentialId), "");

  const existingUserRaw = await c.env.WEBAUTHN_CREDS.get(userKey(session.sub));
  if (!existingUserRaw) {
    const userRecord: UserRecord = {
      name: "user",
      displayName: "user",
      createdAt: now,
    };
    await c.env.WEBAUTHN_CREDS.put(userKey(session.sub), JSON.stringify(userRecord));
  }

  deleteCookie(c, "add_chal", { path: "/auth" });

  return c.json({ ok: true, credentialId });
});

auth.get("/credentials", requireSession, async (c) => {
  const session = c.var.session;
  const prefix = `user_creds:${session.sub}:`;
  const list = await c.env.WEBAUTHN_CREDS.list({ prefix });
  const credentialIds = list.keys.map((k) => k.name.slice(prefix.length));

  const records = await Promise.all(
    credentialIds.map(async (id) => {
      const raw = await c.env.WEBAUTHN_CREDS.get(credKey(id));
      if (!raw) return null;
      const rec = JSON.parse(raw) as CredentialRecord;
      return {
        id,
        createdAt: rec.createdAt,
        transports: rec.transports ?? null,
      };
    }),
  );

  const credentials = records
    .filter((r): r is { id: string; createdAt: string; transports: string[] | null } => r !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return c.json({ credentials });
});

auth.delete("/credentials/:id", requireSession, async (c) => {
  const session = c.var.session;
  const credentialId = c.req.param("id");

  const credRaw = await c.env.WEBAUTHN_CREDS.get(credKey(credentialId));
  if (!credRaw) return c.json({ error: "credential not found" }, 404);
  const cred = JSON.parse(credRaw) as CredentialRecord;
  if (cred.userId !== session.sub) {
    return c.json({ error: "credential not found" }, 404);
  }

  const list = await c.env.WEBAUTHN_CREDS.list({
    prefix: `user_creds:${session.sub}:`,
  });
  if (list.keys.length <= 1) {
    return c.json({ error: "cannot delete last passkey" }, 400);
  }

  await c.env.WEBAUTHN_CREDS.delete(credKey(credentialId));
  await c.env.WEBAUTHN_CREDS.delete(userCredKey(session.sub, credentialId));

  return c.json({ ok: true });
});

auth.get("/me", requireSession, async (c) => {
  const session = c.var.session;
  const userRaw = await c.env.WEBAUTHN_CREDS.get(userKey(session.sub));
  const user = userRaw ? (JSON.parse(userRaw) as UserRecord) : null;
  return c.json({
    userId: session.sub,
    name: user?.name ?? null,
    displayName: user?.displayName ?? null,
    kid: session.kid,
    iat: session.iat,
    exp: session.exp,
  });
});

auth.patch("/me", requireSession, async (c) => {
  const session = c.var.session;
  const body = (await c.req.json().catch(() => null)) as
    | { name?: string; displayName?: string }
    | null;
  const rawName = typeof body?.name === "string" ? body.name.trim() : "";
  if (!rawName) return c.json({ error: "name is required" }, 400);
  const name = rawName.slice(0, 64);
  const rawDisplay =
    typeof body?.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : name;
  const displayName = rawDisplay.slice(0, 128);

  const existingRaw = await c.env.WEBAUTHN_CREDS.get(userKey(session.sub));
  const existing = existingRaw ? (JSON.parse(existingRaw) as UserRecord) : null;
  const userRecord: UserRecord = {
    name,
    displayName,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await c.env.WEBAUTHN_CREDS.put(userKey(session.sub), JSON.stringify(userRecord));

  return c.json({
    userId: session.sub,
    name,
    displayName,
    kid: session.kid,
    iat: session.iat,
    exp: session.exp,
  });
});

auth.post("/logout", async (c) => {
  deleteCookie(c, "sid", { path: "/" });
  return c.json({ ok: true });
});

export { auth };

function userKey(userId: string): string {
  return `users:${userId}`;
}
function credKey(credentialId: string): string {
  return `creds:${credentialId}`;
}
function userCredKey(userId: string, credentialId: string): string {
  return `user_creds:${userId}:${credentialId}`;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
