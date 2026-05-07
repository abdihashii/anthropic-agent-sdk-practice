import { Hono } from "hono";
import { api } from "./routes/api";
import { auth } from "./routes/auth";
import type { AppEnv } from "./lib/env";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.text("worker up\n"));

app.route("/api", api);
app.route("/auth", auth);

export default app;
