# web

Mobile-first TanStack Start app on Cloudflare Workers (SSR). Step 5b of the personal agent project.

## Dev

Run alongside the backend Worker:

```bash
# Terminal A
pnpm dev:worker        # backend on :8787

# Terminal B
pnpm dev:web           # frontend on :3000
```

Set `VITE_API_BASE=http://localhost:8787` in `apps/web/.env.development.local` so SSR fetches reach the backend in dev (in prod, both Workers share `chat.abdirahmanhaji.com` and relative URLs work).

## Build / deploy

```bash
pnpm build:web
pnpm deploy:web        # vite build + wrangler deploy
```

Routes on `chat.abdirahmanhaji.com/*` (catchall). The backend Worker keeps `/auth/*`, `/api/*`, `/health` via Cloudflare's more-specific-wins precedence.

See `spec.md` for the full system design.
