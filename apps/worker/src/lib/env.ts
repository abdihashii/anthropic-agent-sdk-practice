import type { SessionPayload } from "./crypto";

declare global {
  interface Env {
    INTERNAL_WORKER_TO_VPS: string;
    SESSION_SIGNING_KEY: string;
    REGISTRATION_CODE: string;
    DEV_LOGIN_TOKEN: string;
    DEFAULT_DEV_USER_ID: string;
  }
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    session: SessionPayload;
  };
};
