import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  AGENT_ROOT,
  ALLOWED_TOOLS,
  MAIN_MODEL,
  MAX_TURNS,
} from './agent-config.js';

const PORT = Number(process.env.PORT ?? 3000);
const EXPECTED_TOKEN = process.env.INTERNAL_WORKER_TO_VPS ?? '';

if (!EXPECTED_TOKEN) {
  console.error('INTERNAL_WORKER_TO_VPS not set — refusing to start');
  process.exit(1);
}

const app = new Hono();

app.get('/health', (c) => c.text('agent up\n'));

app.post('/api/chat', async (c) => {
  const provided = c.req.header('x-internal-token');
  if (!provided || !timingSafeEqualHashed(provided, EXPECTED_TOKEN)) {
    return c.json({ error: 'bad token' }, 401);
  }

  const body: { message?: string } = await c.req
    .json<{ message?: string }>()
    .catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return c.json({ error: 'missing message' }, 400);
  }

  return streamSSE(c, async (stream) => {
    const events = query({
      prompt: message,
      options: {
        allowedTools: ALLOWED_TOOLS,
        permissionMode: 'acceptEdits',
        model: MAIN_MODEL,
        maxTurns: MAX_TURNS,
        cwd: AGENT_ROOT,
      },
    });

    try {
      for await (const msg of events) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              await stream.writeSSE({
                event: 'chunk',
                data: JSON.stringify({ text: block.text }),
              });
            } else if (block.type === 'tool_use') {
              await stream.writeSSE({
                event: 'tool_use',
                data: JSON.stringify({ id: block.id, name: block.name }),
              });
            }
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({
                session_id: msg.session_id,
                cost_usd: msg.total_cost_usd,
              }),
            });
          } else {
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify({ subtype: msg.subtype, errors: msg.errors }),
            });
          }
        }
      }
    } catch (err) {
      console.error('[agent] query() loop threw:', err);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          message: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  });
});

function timingSafeEqualHashed(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

serve(
  { fetch: app.fetch, hostname: '127.0.0.1', port: PORT },
  (info) => {
    console.log(`agent server listening http://${info.address}:${info.port}`);
  },
);
