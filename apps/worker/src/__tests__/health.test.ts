import { describe, expect, it } from "vitest";
import app from "../index";
import { makeKvMock, makeTestEnv } from "./helpers";

describe("GET /health", () => {
  it("returns 200 with worker up", async () => {
    const env = makeTestEnv({ kv: makeKvMock() });
    const res = await app.request("/health", undefined, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("worker up\n");
  });
});
