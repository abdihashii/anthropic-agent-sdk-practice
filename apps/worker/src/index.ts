import { Hono } from "hono";
import { auth } from "./auth";
import { chatProxy } from "./chat";
import type { AppEnv } from "./env";
import { requireSession } from "./middleware";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.text("worker up\n"));

app.post("/api/chat", requireSession, chatProxy);

app.route("/auth", auth);

export default app;
