import { query } from '@anthropic-ai/claude-agent-sdk';
import { createInterface } from 'node:readline/promises';
import {
  AGENT_ROOT,
  ALLOWED_TOOLS,
  GUARDRAIL_ERROR_CACHE_W,
  GUARDRAIL_ERROR_COST,
  GUARDRAIL_WARN_CACHE_W,
  GUARDRAIL_WARN_COST,
  MAIN_MODEL,
  MAX_TURNS,
  SUBAGENT_MODELS,
} from './agent-config.js';

function shortModel(id: string): string {
  return id.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

let sessionId: string | undefined;

async function chat(prompt: string): Promise<void> {
  const stream = query({
    prompt,
    options: {
      ...(sessionId && { resume: sessionId }),
      allowedTools: ALLOWED_TOOLS,
      permissionMode: 'acceptEdits',
      model: MAIN_MODEL,
      maxTurns: MAX_TURNS,
      cwd: AGENT_ROOT,
    },
  });

  const subagentByToolId = new Map<string, string>();

  for await (const msg of stream) {
    if (msg.type === 'assistant') {
      const activeModel = msg.parent_tool_use_id
        ? subagentByToolId.get(msg.parent_tool_use_id) ?? MAIN_MODEL
        : MAIN_MODEL;
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        } else if (block.type === 'tool_use') {
          const subagentType = block.name === 'Agent'
            ? (block.input as { subagent_type?: string }).subagent_type
            : undefined;
          if (subagentType) {
            subagentByToolId.set(block.id, SUBAGENT_MODELS[subagentType] ?? MAIN_MODEL);
          }
          const label = subagentType
            ? `[agent: ${subagentType} (${shortModel(SUBAGENT_MODELS[subagentType] ?? MAIN_MODEL)})]`
            : `[tool: ${block.name} (${shortModel(activeModel)})]`;
          process.stderr.write(`${label}\n`);
        }
      }
    } else if (msg.type === 'result') {
      sessionId ??= msg.session_id;
      if (msg.subtype === 'success') {
        const breakdown = Object.entries(msg.modelUsage)
          .map(([id, u]) => `${shortModel(id)} $${u.costUSD.toFixed(4)}`)
          .join(', ');
        const tokens = Object.entries(msg.modelUsage)
          .map(([id, u]) =>
            `${shortModel(id)}: in ${u.inputTokens}, cache_r ${u.cacheReadInputTokens}, cache_w ${u.cacheCreationInputTokens}, out ${u.outputTokens}`
          )
          .join(' | ');
        const suffix = breakdown ? ` — ${breakdown}` : '';
        process.stdout.write(`\n[$${msg.total_cost_usd.toFixed(4)}${suffix}]\n`);
        if (tokens) process.stdout.write(`[tokens — ${tokens}]\n`);

        let worstCacheWModel = '';
        let worstCacheW = 0;
        for (const [id, u] of Object.entries(msg.modelUsage)) {
          if (u.cacheCreationInputTokens > worstCacheW) {
            worstCacheW = u.cacheCreationInputTokens;
            worstCacheWModel = shortModel(id);
          }
        }
        const cost = msg.total_cost_usd;
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
