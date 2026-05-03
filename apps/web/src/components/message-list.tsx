import { useQuery } from '@tanstack/react-query'
import { messagesQueryOptions } from '#/lib/api'
import { AssistantMarkdown } from '#/components/assistant-markdown'
import { MessageBlocks } from '#/components/message-block'

interface MessageListProps {
  threadId: string
}

export function MessageList({ threadId }: MessageListProps) {
  const { data, isPending, isError } = useQuery(messagesQueryOptions(threadId))

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  }
  if (isError) {
    return <p className="p-4 text-sm text-destructive">Failed to load.</p>
  }
  if (!data || data.messages.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {data.messages.map((m) => {
        if (m.role === 'user') {
          return (
            <div
              key={m.id}
              className="max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {m.content}
              </pre>
            </div>
          )
        }
        if (m.content_blocks && m.content_blocks.length > 0) {
          return <MessageBlocks key={m.id} blocks={m.content_blocks} />
        }
        return (
          <div
            key={m.id}
            className="max-w-[85%] self-start rounded-lg bg-muted px-4 py-2 text-foreground"
          >
            <AssistantMarkdown text={m.content} />
          </div>
        )
      })}
    </div>
  )
}
