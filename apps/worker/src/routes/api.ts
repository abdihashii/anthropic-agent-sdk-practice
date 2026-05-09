import { Hono } from "hono";
import { chatProxy } from "./chat";
import { getCost } from "./cost";
import type { AppEnv } from "../lib/env";
import { requireSession } from "../lib/middleware";
import {
  createThread,
  getThreadMessages,
  getThreadStream,
  listThreads,
  stopThread,
} from "./threads";

const api = new Hono<AppEnv>();

api.use("*", requireSession);

api.post("/chat", chatProxy);
api.get("/threads", listThreads);
api.post("/threads", createThread);
api.get("/threads/:id/messages", getThreadMessages);
api.post("/threads/:id/stop", stopThread);
api.get("/threads/:id/stream", getThreadStream);
api.get("/cost", getCost);

export { api };
