-- Step 2: memory layer initial schema.
-- Apply: psql $DATABASE_URL -f db/migrations/001_initial.sql
-- Idempotent (CREATE ... IF NOT EXISTS) so re-running is safe.

-- Episodic log: append-only journal of "what happened, when".
-- One row per significant task. Append-only, so no updated_at.
-- thread_id is nullable, no FK; will gain FK to threads(id) in step 3.

CREATE TABLE IF NOT EXISTS episodic_log (
  id          BIGSERIAL PRIMARY KEY,
  summary     TEXT        NOT NULL,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  thread_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS episodic_log_created_at_idx
  ON episodic_log (created_at DESC);
