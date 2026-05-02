import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import {
  AGENT_ROOT,
  ALLOWED_TOOLS,
  MAIN_MODEL,
  MAX_TURNS,
} from './agent-config.js';

const PORT = Number(process.env.PORT ?? 3000);
const EXPECTED_TOKEN = process.env.INTERNAL_WORKER_TO_VPS ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!EXPECTED_TOKEN) {
  console.error('INTERNAL_WORKER_TO_VPS not set — refusing to start');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — refusing to start');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

type AppEnv = {
  Variables: { userId: string };
};

const app = new Hono<AppEnv>();

app.get('/health', (c) => c.text('agent up\n'));

app.use('/api/*', async (c, next) => {
  const provided = c.req.header('x-internal-token');
  if (!provided || !timingSafeEqualHashed(provided, EXPECTED_TOKEN)) {
    return c.json({ error: 'bad token' }, 401);
  }
  const userId = c.req.header('x-user-id');
  if (!userId) return c.json({ error: 'missing user id' }, 401);
  c.set('userId', userId);
  await next();
});

app.get('/api/threads', async (c) => {
  const userId = c.get('userId');
  const result = await pool.query(
    `SELECT id, title, created_at, updated_at
     FROM threads
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [userId],
  );
  return c.json({ threads: result.rows });
});

app.post('/api/threads', async (c) => {
  const userId = c.get('userId');
  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO threads (id, user_id)
     VALUES ($1, $2)
     RETURNING id, title, created_at, updated_at`,
    [id, userId],
  );
  return c.json(result.rows[0]);
});

app.get('/api/threads/:id/messages', async (c) => {
  const userId = c.get('userId');
  const threadId = c.req.param('id');
  const ownership = await pool.query(
    'SELECT 1 FROM threads WHERE id = $1 AND user_id = $2',
    [threadId, userId],
  );
  if (ownership.rows.length === 0) {
    return c.json({ error: 'thread not found' }, 404);
  }
  const result = await pool.query(
    `SELECT id, role, content, created_at
     FROM messages
     WHERE thread_id = $1
     ORDER BY created_at`,
    [threadId],
  );
  return c.json({ messages: result.rows });
});

app.post('/api/chat', async (c) => {
  const userId = c.get('userId');
  const body: { thread_id?: string; message?: string } = await c.req
    .json<{ thread_id?: string; message?: string }>()
    .catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const requestedThreadId =
    typeof body.thread_id === 'string' ? body.thread_id.trim() : '';
  if (!message) return c.json({ error: 'missing message' }, 400);

  let threadId: string;
  let sdk_session_id: string | null;
  let title: string | null;

  if (requestedThreadId === '') {
    threadId = randomUUID();
    await pool.query(
      'INSERT INTO threads (id, user_id) VALUES ($1, $2)',
      [threadId, userId],
    );
    sdk_session_id = null;
    title = null;
  } else {
    threadId = requestedThreadId;
    const threadResult = await pool.query<{
      sdk_session_id: string | null;
      title: string | null;
    }>(
      'SELECT sdk_session_id, title FROM threads WHERE id = $1 AND user_id = $2',
      [threadId, userId],
    );
    if (threadResult.rows.length === 0) {
      return c.json({ error: 'thread not found' }, 404);
    }
    sdk_session_id = threadResult.rows[0].sdk_session_id;
    title = threadResult.rows[0].title;
  }

  if (title === null) {
    await pool.query('UPDATE threads SET title = $1 WHERE id = $2', [
      message.slice(0, 40),
      threadId,
    ]);
  }

  const userMessageId = randomUUID();
  await pool.query(
    `INSERT INTO messages (id, thread_id, role, content)
     VALUES ($1, $2, $3, $4)`,
    [userMessageId, threadId, 'user', message],
  );

  return streamSSE(c, async (stream) => {
    const events = query({
      prompt: message,
      options: {
        allowedTools: ALLOWED_TOOLS,
        permissionMode: 'acceptEdits',
        model: MAIN_MODEL,
        maxTurns: MAX_TURNS,
        cwd: AGENT_ROOT,
        resume: sdk_session_id ?? undefined,
        includePartialMessages: true,
      },
    });

    let accumulated = '';
    let pendingTextSeparator = false;

    try {
      for await (const msg of events) {
        if (msg.type === 'stream_event') {
          const e = msg.event;
          if (
            e.type === 'content_block_start' &&
            e.content_block.type === 'text' &&
            accumulated.length > 0
          ) {
            pendingTextSeparator = true;
          } else if (
            e.type === 'content_block_delta' &&
            e.delta.type === 'text_delta'
          ) {
            if (pendingTextSeparator) {
              accumulated += '\n\n';
              pendingTextSeparator = false;
            }
            accumulated += e.delta.text;
            await stream.writeSSE({
              event: 'chunk',
              data: JSON.stringify({ text: e.delta.text }),
            });
          }
        } else if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name !== 'ToolSearch') {
              await stream.writeSSE({
                event: 'tool_use',
                data: JSON.stringify({
                  id: block.id,
                  name: block.name,
                  input: block.input,
                }),
              });
            }
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const assistantMessageId = randomUUID();
            await pool.query(
              `INSERT INTO messages (id, thread_id, role, content)
               VALUES ($1, $2, $3, $4)`,
              [assistantMessageId, threadId, 'assistant', accumulated],
            );
            await pool.query(
              `UPDATE threads
               SET sdk_session_id = $1, updated_at = NOW()
               WHERE id = $2`,
              [msg.session_id, threadId],
            );
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({
                thread_id: threadId,
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
