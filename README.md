# personal-agent

Personal AI agent: chat, research, memory, tool use. Anthropic Agent SDK on a Hetzner VPS, fronted by Cloudflare (Worker + Tunnel), with a mobile-first SPA on Cloudflare Workers Assets.

See [`spec.md`](./spec.md) for the full system design and [`vps-setup.md`](./vps-setup.md) for the VPS provisioning runbook.

## Local stack

| # | Service           | Port | Source                               | Reads                                                                                  |
| - | ----------------- | ---- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1 | Postgres 17       | 5432 | `docker-compose.yml` (root)          | —                                                                                      |
| 2 | Agent HTTP server | 3000 | `apps/agent/src/server.ts`           | `apps/agent/.env` → `ANTHROPIC_API_KEY`, `DATABASE_URL`, `INTERNAL_WORKER_TO_VPS`      |
| 3 | Cloudflare Worker | 8787 | `apps/worker/` (`wrangler dev`)      | `apps/worker/.dev.vars` → secrets + `VPS_ORIGIN=http://localhost:3000`                 |
| 4 | Vite SPA          | 5173 | `apps/web/` (`vite dev`)             | `apps/web/.env.development.local` (none required by default)                           |

**Request flow:** browser :5173 → Vite proxy → Worker :8787 → Agent :3000 → Postgres :5432

## Prod stack

**Cloudflare** (`chat.abdirahmanhaji.com`) — two Workers sharing the host:

| Worker         | Routes                                                | Type            | Purpose                              |
| -------------- | ----------------------------------------------------- | --------------- | ------------------------------------ |
| `agent-worker` | `/auth/*`, `/api/*`, `/health` (more specific — wins) | Hono script     | Sessions + proxy-to-VPS              |
| `agent-web`    | `/*` (catchall)                                       | Assets-only     | SPA shell + bundle (no JS executes)  |

**Hetzner VPS** (`agent-prod`, `agent.abdirahmanhaji.com`):

- `agent.service` (systemd) → `node /opt/agent/dist/server.js` on `127.0.0.1:3000`
- `cloudflared` tunnel → `agent.abdirahmanhaji.com` (public, but `INTERNAL_WORKER_TO_VPS`-gated)
- Postgres 17 (system service) on `127.0.0.1:5432`
- Reads `/opt/agent/.env` → `ANTHROPIC_API_KEY`, `DATABASE_URL`, `INTERNAL_WORKER_TO_VPS`

**Request flow:** phone → CF edge → `agent-web` (assets) for HTML/JS → SPA → `/api/*` to `agent-worker` → tunnel → VPS:3000 → Postgres → up the chain

## Use end-to-end — local

```bash
docker compose up -d postgres   # one-time / leave running
pnpm dev:agent:server           # terminal A — port 3000
pnpm dev:worker                 # terminal B — port 8787
pnpm dev:web                    # terminal C — port 5173
```

Browser: `http://localhost:5173/login` → paste `DEV_LOGIN_TOKEN` from `apps/worker/.dev.vars` → app.

## Use end-to-end — prod

Three independent deploy targets; ship whatever changed:

```bash
# Worker (auth + API gateway)
pnpm deploy:worker

# Web (SPA shell + bundle)
pnpm deploy:web

# Agent server (VPS)
pnpm --filter agent build
scp apps/agent/dist/{server,index,agent-config}.js agent-prod:/opt/agent/dist/
ssh agent-prod "sudo systemctl restart agent.service"
```

iPhone: `https://chat.abdirahmanhaji.com/login` → paste prod `DEV_LOGIN_TOKEN` (Workers Secret value) → app.

## Where secrets live (must stay in sync)

| Secret                    | `apps/agent/.env` | `apps/worker/.dev.vars` | VPS `/opt/agent/.env` | Workers Secret |
| ------------------------- | :---------------: | :---------------------: | :-------------------: | :------------: |
| `ANTHROPIC_API_KEY`       | ✓                 | —                       | ✓                     | —              |
| `DATABASE_URL`            | ✓                 | —                       | ✓                     | —              |
| `INTERNAL_WORKER_TO_VPS`  | ✓                 | ✓                       | ✓                     | ✓              |
| `SESSION_SIGNING_KEY`     | —                 | ✓                       | —                     | ✓              |
| `REGISTRATION_CODE`       | —                 | ✓                       | —                     | ✓              |
| `DEV_LOGIN_TOKEN`         | —                 | ✓                       | —                     | ✓              |

Local `INTERNAL_WORKER_TO_VPS` does not have to match prod — local Worker ↔ local agent is its own pair. But within local, the three rows must agree; within prod, the two rows must agree.
