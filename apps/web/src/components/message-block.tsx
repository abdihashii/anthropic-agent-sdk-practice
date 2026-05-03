import type { Block } from '#/hooks/use-chat-stream'
import { ToolChip } from '#/components/tool-chip'
import { AssistantMarkdown } from '#/components/assistant-markdown'

type ToolUseBlock = Extract<Block, { type: 'tool_use' }>

export function MessageBlocks({ blocks }: { blocks: Array<Block> }) {
  const childrenByParent = new Map<string, Array<ToolUseBlock>>()
  for (const b of blocks) {
    if (b.type === 'tool_use' && b.parent_tool_use_id) {
      const arr = childrenByParent.get(b.parent_tool_use_id) ?? []
      arr.push(b)
      childrenByParent.set(b.parent_tool_use_id, arr)
    }
  }
  const topLevel = blocks.filter(
    (b) => b.type !== 'tool_use' || !b.parent_tool_use_id,
  )

  return (
    <>
      {topLevel.map((b, i) => {
        if (b.type === 'tool_use') {
          const children = childrenByParent.get(b.id) ?? []
          return (
            <div
              key={i}
              className="flex flex-col items-start gap-1 self-start"
            >
              <ToolChip name={b.name} input={b.input} />
              {children.length > 0 && (
                <div className="ml-4 flex flex-col items-start gap-1 border-l border-muted pl-3">
                  {children.map((c, j) => (
                    <ToolChip key={j} name={c.name} input={c.input} />
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <div
            key={i}
            className="max-w-[85%] self-start rounded-lg bg-muted px-4 py-2 text-foreground"
          >
            <AssistantMarkdown text={b.text} />
          </div>
        )
      })}
    </>
  )
}
