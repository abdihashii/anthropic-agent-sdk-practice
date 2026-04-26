#!/usr/bin/env node
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values } = parseArgs({
  options: {
    sql:   { type: 'string' },
    write: { type: 'boolean', default: false },
  },
  strict: true,
});

const die = (msg) => { process.stderr.write(msg + '\n'); process.exit(1); };

if (!values.sql) die('--sql is required');
if (!process.env.DATABASE_URL) die('DATABASE_URL not set');
if (!values.write && !/^\s*(select|with|explain)\b/i.test(values.sql)) {
  die('Write mode required for non-SELECT statements. Pass --write.');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let result;
try {
  result = await client.query(values.sql);
} finally {
  await client.end();
}
process.stdout.write(JSON.stringify(result.rows, null, 2) + '\n');
