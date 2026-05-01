import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            INTERNAL_WORKER_TO_VPS: "test-worker-to-vps",
            SESSION_SIGNING_KEY: "test-session-key-32-bytes-min!!!",
            REGISTRATION_CODE: "test-registration-code"
          }
        }
      }
    }
  }
});
