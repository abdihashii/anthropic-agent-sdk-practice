export function makeKvMock(): KVNamespace {
  const store = new Map<string, string>();
  const ns = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts?: { prefix?: string }) {
      const prefix = opts?.prefix ?? "";
      return {
        keys: Array.from(store.keys())
          .filter((name) => name.startsWith(prefix))
          .map((name) => ({ name })),
        list_complete: true,
        cacheStatus: null,
      };
    },
    async getWithMetadata(key: string) {
      return { value: store.get(key) ?? null, metadata: null, cacheStatus: null };
    },
  };
  return ns as unknown as KVNamespace;
}

export function makeTestEnv(opts: { kv: KVNamespace }): Env {
  return {
    INTERNAL_WORKER_TO_VPS: "test-worker-to-vps",
    SESSION_SIGNING_KEY: "test-session-key-32-bytes-min!!!",
    REGISTRATION_CODE: "test-registration-code",
    DEV_LOGIN_TOKEN: "test-dev-login-token",
    DEFAULT_DEV_USER_ID: "test-dev-user",
    VPS_ORIGIN: "https://upstream.test",
    WEBAUTHN_RP_ID: "chat.example.com",
    WEBAUTHN_RP_NAME: "Test",
    WEBAUTHN_ORIGIN: "https://chat.example.com",
    SESSION_KID: "v1",
    WEBAUTHN_CREDS: opts.kv,
  } as unknown as Env;
}
