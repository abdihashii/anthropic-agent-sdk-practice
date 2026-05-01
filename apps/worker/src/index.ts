import { Hono } from "hono";
import { api } from "./routes/api";
import { auth } from "./routes/auth";
import { devLogin } from "./routes/dev-login";
import type { AppEnv } from "./lib/env";
import { requireHeaderToken } from "./lib/middleware";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.text("worker up\n"));

app.post(
  "/auth/dev-login",
  requireHeaderToken("x-dev-login-token", "DEV_LOGIN_TOKEN"),
  devLogin,
);

app.route("/api", api);
app.route("/auth", auth);

export default app;
