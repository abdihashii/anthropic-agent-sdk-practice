-- Step 5a: threads + messages.
-- Apply: psql $DATABASE_URL -f db/migrations/002_threads_messages.sql
-- Idempotent (CREATE ... IF NOT EXISTS) so re-running is safe.

-- threads: one row per multi-turn conversation. user_id is TEXT (matches
-- WEBAUTHN_CREDS KV `users:<uuid>` shape); no FK because users live in KV, not Postgres.
-- title is null until the first user message persists, then set lazily by the chat
-- handler. sdk_session_id is captured from the SDK's system:init event on first turn
-- and resumed on subsequent turns.

CREATE TABLE IF NOT EXISTS threads (
  id              TEXT        PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  title           TEXT,
  sdk_session_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS threads_user_updated_idx
  ON threads (user_id, updated_at DESC);

-- messages: append-only chat history scoped to a thread. content is TEXT (not JSONB
-- content_blocks); tool calls are not persisted in step 5. role is checked.

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT        PRIMARY KEY,
  thread_id    TEXT        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_thread_created_idx
  ON messages (thread_id, created_at);
