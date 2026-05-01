import { Hono } from "hono";
import { chatProxy } from "./chat";
import type { AppEnv } from "../lib/env";
import { requireSession } from "../lib/middleware";
import { createThread, getThreadMessages, listThreads } from "./threads";

const api = new Hono<AppEnv>();

api.use("*", requireSession);

api.post("/chat", chatProxy);
api.get("/threads", listThreads);
api.post("/threads", createThread);
api.get("/threads/:id/messages", getThreadMessages);

export { api };
