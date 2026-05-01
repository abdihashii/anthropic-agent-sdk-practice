import { describe, expect, it } from "vitest";
import {
  signChallengeCookie,
  signSessionJwt,
  timingSafeEqualHashed,
  verifyChallengeCookie,
  verifySessionJwt,
} from "../crypto";

const SECRET = "test-session-key-32-bytes-min!!!";

describe("timingSafeEqualHashed", () => {
  it("returns true for equal strings", async () => {
    expect(await timingSafeEqualHashed("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of same length", async () => {
    expect(await timingSafeEqualHashed("hello", "world")).toBe(false);
  });

  it("returns false for different strings of different length", async () => {
    expect(await timingSafeEqualHashed("hi", "hello")).toBe(false);
  });

  it("returns false for empty vs non-empty", async () => {
    expect(await timingSafeEqualHashed("", "hello")).toBe(false);
  });
});

describe("session JWT", () => {
  it("round-trips a valid token", async () => {
    const token = await signSessionJwt({ sub: "user-1", kid: "v1" }, SECRET);
    const payload = await verifySessionJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-1");
    expect(payload?.kid).toBe("v1");
    expect(payload?.iat).toBeTypeOf("number");
    expect(payload?.exp).toBeTypeOf("number");
    expect((payload?.exp ?? 0) - (payload?.iat ?? 0)).toBe(60 * 60 * 24 * 30);
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await signSessionJwt({ sub: "user-1", kid: "v1" }, SECRET);
    const payload = await verifySessionJwt(token, "another-secret-32-bytes-padding!");
    expect(payload).toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await signSessionJwt({ sub: "user-1", kid: "v1" }, SECRET);
    const tampered = token.slice(0, -3) + "AAA";
    const payload = await verifySessionJwt(tampered, SECRET);
    expect(payload).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySessionJwt("not.a.jwt", SECRET)).toBeNull();
    expect(await verifySessionJwt("", SECRET)).toBeNull();
  });
});

describe("challenge cookie", () => {
  it("round-trips a payload", async () => {
    const cookie = await signChallengeCookie({ kind: "register", challenge: "abc" }, SECRET, 300);
    const decoded = await verifyChallengeCookie<{ kind: string; challenge: string }>(cookie, SECRET);
    expect(decoded?.kind).toBe("register");
    expect(decoded?.challenge).toBe("abc");
  });

  it("rejects wrong secret", async () => {
    const cookie = await signChallengeCookie({ kind: "register", challenge: "abc" }, SECRET, 300);
    const decoded = await verifyChallengeCookie(cookie, "another-secret-32-bytes-padding!");
    expect(decoded).toBeNull();
  });
});
