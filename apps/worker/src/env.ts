import type { SessionPayload } from "./crypto";

declare global {
  interface Env {
    INTERNAL_WORKER_TO_VPS: string;
    SESSION_SIGNING_KEY: string;
    REGISTRATION_CODE: string;
  }
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    session: SessionPayload;
  };
};
