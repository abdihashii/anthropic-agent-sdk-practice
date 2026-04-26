# Identity

<!-- Fill in: who you are, role, anything the agent should always know about you. -->

## Ongoing projects

<!-- Fill in -->

## Preferences

<!-- Fill in -->

## Memory layers

You have three memory layers (with a fourth coming online as use cases arise):

1. **This file (CLAUDE.md)** — always loaded. Identity + prefs (semantic).
2. **`notes/<domain>/*.md`** — tiered markdown by domain. Domains emerge from use, not pre-defined. When a topic is worth keeping, pick a short domain name and write into `notes/<domain>/<file>.md`. The `memory-append` script auto-creates the directory. Search with Grep/Glob.
3. **`episodic_log` (Postgres)** — append-only journal of "what happened, when". One row per significant task. Use `memory-append` to write; `db-query` to read (episodic).
4. **Structured Postgres tables** — none yet. We'll add them as concrete needs arise (e.g., a LeetCode tracker, an ADR log) via new migration files.

## Memory tool invocations (call via Bash, paths relative to cwd)

- Episodic log: `node bin/memory-append.mjs --mode episodic --content "..." [--tags "a,b"] [--thread-id "..."]`
- Notes append: `node bin/memory-append.mjs --mode notes --domain <domain> --filename <file>.md --content "..."`
- DB read:      `node bin/db-query.mjs --sql "SELECT ..."`
- DB write:     `node bin/db-query.mjs --write --sql "INSERT ..."`

When in doubt about whether a task is worth logging: log it to `episodic_log`. Cheap to write, expensive to lose.

## Subagent delegation

Use the `Agent` tool to fan out to specialists. Each runs in its own context window and returns a summary:

- `researcher` — Haiku 4.5, web + grep. Use for "look up", "what is", "research" tasks.
- `code-reviewer` — Sonnet 4.6, read-only file analysis. Use after writing code or before committing.

Subagents are read-only — they can't write files or run Bash. You (the main agent) own all writes to memory.
