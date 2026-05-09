-- Step 7a: task_logs.
-- Apply: psql $DATABASE_URL -f db/migrations/004_task_logs.sql
-- Idempotent (CREATE ... IF NOT EXISTS) so re-running is safe.

-- task_logs: one row per agent turn (server.ts /api/chat OR CLI index.ts).
-- thread_id is nullable because CLI turns aren't threaded; cascade still applies
-- when set. model_usage is the per-model breakdown for the turn (main + any
-- subagent models invoked); top-level token columns are pre-summed across the
-- model_usage entries so cache_hit_ratio queries don't need jsonb_array_elements.

CREATE TABLE IF NOT EXISTS task_logs (
  id                   TEXT        PRIMARY KEY,
  thread_id            TEXT        REFERENCES threads(id) ON DELETE CASCADE,
  source               TEXT        NOT NULL CHECK (source IN ('server', 'cli')),
  tier                 TEXT        NOT NULL CHECK (tier IN ('haiku', 'sonnet', 'opus')),
  classifier_fallback  BOOLEAN     NOT NULL DEFAULT FALSE,
  model_usage          JSONB       NOT NULL,
  total_cost_usd       REAL        NOT NULL,
  classifier_cost_usd  REAL        NOT NULL,
  input_tokens         INTEGER     NOT NULL,
  output_tokens        INTEGER     NOT NULL,
  cache_read_tokens    INTEGER     NOT NULL,
  cache_write_tokens   INTEGER     NOT NULL,
  tool_call_count      INTEGER     NOT NULL,
  tool_error_count     INTEGER     NOT NULL,
  subagent_count       INTEGER     NOT NULL,
  num_turns            INTEGER     NOT NULL,
  latency_ms           INTEGER     NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_logs_created_idx
  ON task_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS task_logs_thread_idx
  ON task_logs (thread_id);
