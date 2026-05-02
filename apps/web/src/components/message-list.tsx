import { useQuery } from '@tanstack/react-query'
import { messagesQueryOptions } from '#/lib/api'
import { AssistantMarkdown } from '#/components/assistant-markdown'

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
      {data.messages.map((m) => (
        <div
          key={m.id}
          className={
            m.role === 'user'
              ? 'max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground'
              : 'max-w-[85%] self-start rounded-lg bg-muted px-4 py-2 text-foreground'
          }
        >
          {m.role === 'assistant' ? (
            <AssistantMarkdown text={m.content} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {m.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
