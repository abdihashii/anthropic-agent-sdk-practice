-- Step 5f: persist structured content blocks (text + tool_use) so reload restores tool chips.
-- Apply: psql $DATABASE_URL -f db/migrations/003_message_blocks.sql
-- Idempotent (IF NOT EXISTS) so re-running is safe.

-- content_blocks is nullable: rows written before this migration fall back to the
-- flattened `content TEXT`. Rows written after carry both — `content` stays as the
-- text representation (search/copy-paste/safety net) and `content_blocks` is the
-- structured array { type:'text'|'tool_use', ...} that the renderer prefers.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_blocks JSONB;
