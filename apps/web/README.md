# web

Mobile-first SPA on Cloudflare Workers Assets. TanStack Start in SPA mode (`spa.enabled: true`) — prerenders a static shell, hydrates client-side. Step 5b of the personal agent project.

See the [root README](../../README.md) for the full local + prod stack rundown.

## Dev

```bash
pnpm dev:web           # vite on :5173
```

Needs the worker on :8787 and the agent server on :3000 — see root README.

## Build / deploy

```bash
pnpm build:web
pnpm deploy:web        # vite build + wrangler deploy
```

Deploys as the `agent-web` Worker on `chat.abdirahmanhaji.com/*` (catchall). The backend `agent-worker` keeps `/auth/*`, `/api/*`, `/health` via Cloudflare's more-specific-wins precedence.
