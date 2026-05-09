import { query } from '@anthropic-ai/claude-agent-sdk';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';
import {
  AGENT_ROOT,
  ALLOWED_TOOLS,
  GUARDRAIL_ERROR_CACHE_W,
  GUARDRAIL_ERROR_COST,
  GUARDRAIL_WARN_CACHE_W,
  GUARDRAIL_WARN_COST,
  MAX_TURNS,
  SUBAGENT_MODELS,
  TIER_MODELS,
} from './agent-config.js';
import { classify } from './model-router.js';
import { buildTaskLogRow, writeTaskLog } from './task-logs.js';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — refusing to start');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL });

function shortModel(id: string): string {
  return id.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

let sessionId: string | undefined;

async function chat(prompt: string): Promise<void> {
  const decision = await classify(prompt);
  process.stderr.write(`[router: ${decision.tier} — ${decision.reason}]\n`);

  const mainModel = TIER_MODELS[decision.tier];

  const stream = query({
    prompt,
    options: {
      ...(sessionId && { resume: sessionId }),
      allowedTools: ALLOWED_TOOLS,
      permissionMode: 'acceptEdits',
      model: mainModel,
      maxTurns: MAX_TURNS,
      cwd: AGENT_ROOT,
    },
  });

  const subagentByToolId = new Map<string, string>();
  let toolCallCount = 0;
  let toolErrorCount = 0;
  const t0 = Date.now();

  for await (const msg of stream) {
    if (msg.type === 'assistant') {
      const activeModel = msg.parent_tool_use_id
        ? subagentByToolId.get(msg.parent_tool_use_id) ?? mainModel
        : mainModel;
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        } else if (block.type === 'tool_use') {
          const subagentType = block.name === 'Agent'
            ? (block.input as { subagent_type?: string }).subagent_type
            : undefined;
          if (subagentType) {
            subagentByToolId.set(block.id, SUBAGENT_MODELS[subagentType] ?? mainModel);
          } else if (block.name !== 'ToolSearch') {
            toolCallCount += 1;
          }
          const label = subagentType
            ? `[agent: ${subagentType} (${shortModel(SUBAGENT_MODELS[subagentType] ?? mainModel)})]`
            : `[tool: ${block.name} (${shortModel(activeModel)})]`;
          process.stderr.write(`${label}\n`);
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
      sessionId ??= msg.session_id;
      if (msg.subtype === 'success') {
        const breakdownParts = Object.entries(msg.modelUsage).map(
          ([id, u]) => `${shortModel(id)} $${u.costUSD.toFixed(4)}`,
        );
        if (decision.costUSD > 0) {
          breakdownParts.push(`classifier $${decision.costUSD.toFixed(4)}`);
        }
        const breakdown = breakdownParts.join(', ');
        const tokens = Object.entries(msg.modelUsage)
          .map(([id, u]) =>
            `${shortModel(id)}: in ${u.inputTokens}, cache_r ${u.cacheReadInputTokens}, cache_w ${u.cacheCreationInputTokens}, out ${u.outputTokens}`
          )
          .join(' | ');
        const totalCost = msg.total_cost_usd + decision.costUSD;
        const suffix = breakdown ? ` — ${breakdown}` : '';
        process.stdout.write(`\n[$${totalCost.toFixed(4)}${suffix}]\n`);
        if (tokens) process.stdout.write(`[tokens — ${tokens}]\n`);

        let worstCacheWModel = '';
        let worstCacheW = 0;
        for (const [id, u] of Object.entries(msg.modelUsage)) {
          if (u.cacheCreationInputTokens > worstCacheW) {
            worstCacheW = u.cacheCreationInputTokens;
            worstCacheWModel = shortModel(id);
          }
        }
        const cost = totalCost;
        const reasons: string[] = [];
        let level: 'ERROR' | 'WARN' | null = null;
        const escalate = (l: 'ERROR' | 'WARN') => {
          if (l === 'ERROR' || level === null) level = l;
        };
        if (cost > GUARDRAIL_ERROR_COST) {
          escalate('ERROR');
          reasons.push(`turn cost $${cost.toFixed(4)} exceeds $${GUARDRAIL_ERROR_COST.toFixed(2)}`);
        } else if (cost > GUARDRAIL_WARN_COST) {
          escalate('WARN');
          reasons.push(`turn cost $${cost.toFixed(4)} exceeds $${GUARDRAIL_WARN_COST.toFixed(2)}`);
        }
        if (worstCacheW > GUARDRAIL_ERROR_CACHE_W) {
          escalate('ERROR');
          reasons.push(`${worstCacheWModel} cache_w ${worstCacheW} exceeds ${GUARDRAIL_ERROR_CACHE_W}`);
        } else if (worstCacheW > GUARDRAIL_WARN_CACHE_W) {
          escalate('WARN');
          reasons.push(`${worstCacheWModel} cache_w ${worstCacheW} exceeds ${GUARDRAIL_WARN_CACHE_W}`);
        }
        if (level) {
          const color = level === 'ERROR' ? '\x1b[31m' : '\x1b[33m';
          process.stderr.write(`${color}[${level}] ${reasons.join('; ')}\x1b[0m\n`);
        }
        try {
          await writeTaskLog(
            pool,
            buildTaskLogRow({
              threadId: null,
              source: 'cli',
              decision,
              modelUsage: msg.modelUsage,
              totalCostUSD: totalCost,
              toolCallCount,
              toolErrorCount,
              subagentCount: subagentByToolId.size,
              numTurns: msg.num_turns,
              latencyMs: Date.now() - t0,
            }),
          );
        } catch (err) {
          process.stderr.write(
            `[task_logs] write failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      } else {
        process.stderr.write(`\nFailed (${msg.subtype}): ${msg.errors.join('; ')}\n`);
      }
    }
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Agent ready. Type your message (Ctrl+C to exit).\n');

  try {
    while (true) {
      const input = await rl.question('You: ');
      if (!input.trim()) continue;
      process.stdout.write('\nAgent: ');
      await chat(input.trim());
      process.stdout.write('\n');
    }
  } finally {
    rl.close();
  }
}

main().catch(console.error);
