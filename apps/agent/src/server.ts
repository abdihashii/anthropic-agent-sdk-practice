import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import {
  AGENT_ROOT,
  ALLOWED_TOOLS,
  MAX_TURNS,
  TIER_MODELS,
} from './agent-config.js';
import { classify } from './model-router.js';
import { buildTaskLogRow, writeTaskLog } from './task-logs.js';

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

type Block =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      parent_tool_use_id?: string;
    };

const app = new Hono<AppEnv>();

app.get('/health', (c) => c.text('agent up\n'));

app.use('/api/*', async (c, next) => {
  const provided = c.req.header('x-internal-token');
  if (!provided || !timingSafeEqualHashed(provided, EXPECTED_TOKEN)) {
    return c.json({ error: 'bad token' }, 401);
  }
  const userId = c.req.header('x-user-id');
  if (!userId && c.req.path !== '/api/cost') {
    return c.json({ error: 'missing user id' }, 401);
  }
  if (userId) c.set('userId', userId);
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
    `SELECT id, role, content, content_blocks, created_at
     FROM messages
     WHERE thread_id = $1
     ORDER BY created_at`,
    [threadId],
  );
  return c.json({ messages: result.rows });
});

app.get('/api/cost', async (c) => {
  const [weeklyByModel, aggregates, tierDist] = await Promise.all([
    pool.query(
      `SELECT mu->>'model_id' AS model_id,
              SUM((mu->>'cost_usd')::real) AS cost_usd,
              SUM((mu->>'input_tokens')::int) AS input_tokens,
              SUM((mu->>'output_tokens')::int) AS output_tokens,
              SUM((mu->>'cache_read_tokens')::int) AS cache_read_tokens,
              SUM((mu->>'cache_write_tokens')::int) AS cache_write_tokens
       FROM task_logs, jsonb_array_elements(model_usage) mu
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY mu->>'model_id'
       ORDER BY cost_usd DESC`,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_turns,
         COALESCE(SUM(total_cost_usd), 0)::real AS total_cost_usd,
         COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
         COALESCE(SUM(cache_read_tokens + cache_write_tokens + input_tokens), 0)::bigint AS total_input_combined,
         COALESCE(SUM(tool_call_count), 0)::bigint AS tool_calls,
         COALESCE(SUM(tool_error_count), 0)::bigint AS tool_errors,
         COALESCE(SUM(subagent_count), 0)::bigint AS subagent_count_total,
         COALESCE(SUM(CASE WHEN classifier_fallback THEN 1 ELSE 0 END), 0)::int AS classifier_fallbacks,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS latency_p50_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS latency_p95_ms
       FROM task_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'`,
    ),
    pool.query(
      `SELECT tier, COUNT(*)::int AS n
       FROM task_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY tier`,
    ),
  ]);

  const a = aggregates.rows[0];
  const totalTurns: number = a.total_turns;

  return c.json({
    window_days: 7,
    total_turns: totalTurns,
    total_cost_usd: a.total_cost_usd,
    cache_hit_ratio:
      Number(a.total_input_combined) > 0
        ? Number(a.cache_read_tokens) / Number(a.total_input_combined)
        : 0,
    tool_success_rate:
      Number(a.tool_calls) > 0
        ? 1 - Number(a.tool_errors) / Number(a.tool_calls)
        : null,
    latency_p50_ms: a.latency_p50_ms,
    latency_p95_ms: a.latency_p95_ms,
    subagent_count_total: Number(a.subagent_count_total),
    classifier_fallback_rate:
      totalTurns > 0 ? a.classifier_fallbacks / totalTurns : 0,
    weekly_by_model: weeklyByModel.rows.map(
      (r: {
        model_id: string;
        cost_usd: number;
        input_tokens: string | number;
        output_tokens: string | number;
        cache_read_tokens: string | number;
        cache_write_tokens: string | number;
      }) => ({
        model_id: r.model_id,
        cost_usd: r.cost_usd,
        input_tokens: Number(r.input_tokens),
        output_tokens: Number(r.output_tokens),
        cache_read_tokens: Number(r.cache_read_tokens),
        cache_write_tokens: Number(r.cache_write_tokens),
      }),
    ),
    tier_distribution: Object.fromEntries(
      tierDist.rows.map((r: { tier: string; n: number }) => [r.tier, r.n]),
    ),
  });
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

  const decision = await classify(message);
  console.error(`[router: ${decision.tier} — ${decision.reason}]`);
  const t0 = Date.now();

  return streamSSE(c, async (stream) => {
    const events = query({
      prompt: message,
      options: {
        allowedTools: ALLOWED_TOOLS,
        permissionMode: 'acceptEdits',
        model: TIER_MODELS[decision.tier],
        maxTurns: MAX_TURNS,
        cwd: AGENT_ROOT,
        resume: sdk_session_id ?? undefined,
        includePartialMessages: true,
      },
    });

    const blocks: Array<Block> = [];
    let pendingNewTextBlock = false;
    let toolCallCount = 0;
    let toolErrorCount = 0;
    const subagentToolIds = new Set<string>();

    try {
      for await (const msg of events) {
        if (msg.type === 'stream_event') {
          const e = msg.event;
          if (
            e.type === 'content_block_start' &&
            e.content_block.type === 'text' &&
            blocks.some((b) => b.type === 'text')
          ) {
            pendingNewTextBlock = true;
          } else if (
            e.type === 'content_block_delta' &&
            e.delta.type === 'text_delta'
          ) {
            const last = blocks[blocks.length - 1];
            if (pendingNewTextBlock || !last || last.type !== 'text') {
              blocks.push({ type: 'text', text: e.delta.text });
              pendingNewTextBlock = false;
            } else {
              last.text += e.delta.text;
            }
            await stream.writeSSE({
              event: 'chunk',
              data: JSON.stringify({ text: e.delta.text }),
            });
          }
        } else if (msg.type === 'assistant') {
          const parentId = msg.parent_tool_use_id ?? null;
          for (const block of msg.message.content) {
            if (block.type === 'tool_use' && block.name !== 'ToolSearch') {
              if (block.name === 'Agent') {
                subagentToolIds.add(block.id);
              } else {
                toolCallCount += 1;
              }
              const payload = {
                id: block.id,
                name: block.name,
                input: block.input,
                ...(parentId ? { parent_tool_use_id: parentId } : {}),
              };
              blocks.push({ type: 'tool_use', ...payload });
              await stream.writeSSE({
                event: 'tool_use',
                data: JSON.stringify(payload),
              });
            }
          }
        } else if (msg.type === 'user') {
          const content = msg.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === 'object' &&
                block !== null &&
                (block as { type?: string }).type === 'tool_result' &&
                (block as { is_error?: boolean }).is_error === true
              ) {
                toolErrorCount += 1;
              }
            }
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const flatText = blocks
              .filter(
                (b): b is Extract<Block, { type: 'text' }> => b.type === 'text',
              )
              .map((b) => b.text)
              .join('\n\n');
            const assistantMessageId = randomUUID();
            await pool.query(
              `INSERT INTO messages (id, thread_id, role, content, content_blocks)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                assistantMessageId,
                threadId,
                'assistant',
                flatText,
                JSON.stringify(blocks),
              ],
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
                cost_usd: msg.total_cost_usd + decision.costUSD,
              }),
            });
            try {
              await writeTaskLog(
                pool,
                buildTaskLogRow({
                  threadId,
                  source: 'server',
                  decision,
                  modelUsage: msg.modelUsage,
                  totalCostUSD: msg.total_cost_usd + decision.costUSD,
                  toolCallCount,
                  toolErrorCount,
                  subagentCount: subagentToolIds.size,
                  numTurns: msg.num_turns,
                  latencyMs: Date.now() - t0,
                }),
              );
            } catch (err) {
              console.error('[task_logs] write failed:', err);
            }
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
