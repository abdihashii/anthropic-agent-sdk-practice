import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  StickToBottom,
  useStickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom'
import { ChevronDownIcon } from 'lucide-react'
import { messagesQueryOptions } from '#/lib/api'
import { useChatStream, type Block } from '#/hooks/use-chat-stream'
import { MessageList } from '#/components/message-list'
import { Composer } from '#/components/composer'
import { ToolChip } from '#/components/tool-chip'
import { Button } from '#/components/ui/button'

interface ThreadViewProps {
  threadId: string | null
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const stickInstance = useStickToBottom({ initial: 'instant', resize: 'smooth' })
  const chat = useChatStream()

  async function handleSend(text: string) {
    void stickInstance.scrollToBottom()
    const result = await chat.send(text, threadId)
    if (!result) return
    queryClient.removeQueries({ queryKey: ['messages', result.thread_id] })
    await queryClient.fetchQuery(messagesQueryOptions(result.thread_id))
    chat.reset()
    queryClient.invalidateQueries({ queryKey: ['threads'] })
    if (threadId === null) {
      router.navigate({
        to: '/t/$threadId',
        params: { threadId: result.thread_id },
      })
    }
  }

  const lastBlock = chat.blocks[chat.blocks.length - 1]
  const showThinking =
    chat.status === 'streaming' &&
    (chat.blocks.length === 0 || lastBlock?.type === 'tool_use')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        instance={stickInstance}
        className="relative min-h-0 flex-1"
      >
        <StickToBottom.Content className="flex flex-col">
          {threadId !== null && <MessageList threadId={threadId} />}
          {chat.pendingUserMessage !== null && (
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {chat.pendingUserMessage}
                </pre>
              </div>
              {chat.blocks.map((block, i) => (
                <LiveBlock key={i} block={block} />
              ))}
              {showThinking && (
                <p className="self-start text-sm italic text-muted-foreground">
                  Thinking…
                </p>
              )}
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomPill />
      </StickToBottom>
      {chat.errorMessage && (
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 text-sm"
          role="alert"
        >
          <p className="text-destructive">{chat.errorMessage}</p>
          {chat.pendingUserMessage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void chat.send(chat.pendingUserMessage!, threadId)
              }}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      <Composer
        disabled={chat.status === 'streaming'}
        onSend={handleSend}
      />
    </div>
  )
}

function LiveBlock({ block }: { block: Block }) {
  if (block.type === 'tool_use') {
    return <ToolChip name={block.name} input={block.input} />
  }
  return (
    <div className="max-w-[85%] self-start rounded-lg bg-muted px-4 py-2 text-foreground">
      <pre className="whitespace-pre-wrap font-sans text-sm">{block.text}</pre>
    </div>
  )
}

function ScrollToBottomPill() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to bottom"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
    >
      <ChevronDownIcon className="size-3.5" />
      Scroll down
    </Button>
  )
}
