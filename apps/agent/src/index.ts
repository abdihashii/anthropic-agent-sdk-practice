import { query } from '@anthropic-ai/claude-agent-sdk';
import { createInterface } from 'node:readline/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ALLOWED_TOOLS = ['Read', 'Write', 'Grep', 'WebSearch'];

let sessionId: string | undefined;

async function chat(prompt: string): Promise<void> {
  const stream = query({
    prompt,
    options: {
      ...(sessionId && { resume: sessionId }),
      allowedTools: ALLOWED_TOOLS,
      permissionMode: 'acceptEdits',
      model: 'claude-sonnet-4-6',
      maxTurns: 25,
      cwd: REPO_ROOT,
    },
  });

  for await (const msg of stream) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          process.stdout.write(block.text);
        }
      }
    } else if (msg.type === 'result') {
      sessionId ??= msg.session_id;
      if (msg.subtype === 'success') {
        process.stdout.write(`\n[$${msg.total_cost_usd.toFixed(4)}]\n`);
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
