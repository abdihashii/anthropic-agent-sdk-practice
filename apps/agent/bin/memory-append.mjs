#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { appendFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const NOTES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../notes');

const { values } = parseArgs({
  options: {
    mode:        { type: 'string' },
    content:     { type: 'string' },
    tags:        { type: 'string' },
    'thread-id': { type: 'string' },
    domain:      { type: 'string' },
    filename:    { type: 'string' },
  },
  strict: true,
});

const die = (msg) => { process.stderr.write(msg + '\n'); process.exit(1); };

if (!values.content) die('--content is required');

if (values.mode === 'episodic') {
  if (!process.env.DATABASE_URL) die('DATABASE_URL not set');
  const tags = values.tags ? values.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO episodic_log (summary, tags, thread_id) VALUES ($1, $2, $3)',
      [values.content, tags, values['thread-id'] ?? null],
    );
  } finally {
    await client.end();
  }
} else if (values.mode === 'notes') {
  if (!values.domain || !values.filename) die('--domain and --filename are required');
  const dir = join(NOTES_ROOT, basename(values.domain));
  const target = join(dir, basename(values.filename));
  mkdirSync(dir, { recursive: true });
  const prefix = existsSync(target) && statSync(target).size > 0 ? '\n\n' : '';
  appendFileSync(target, prefix + values.content);
} else {
  die('--mode must be episodic or notes');
}
