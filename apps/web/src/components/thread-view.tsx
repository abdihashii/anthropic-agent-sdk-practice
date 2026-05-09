import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  StickToBottom,
  useStickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom'
import { ChevronDownIcon } from 'lucide-react'
import { messagesQueryOptions } from '#/lib/api'
import { useChatStream } from '#/hooks/use-chat-stream'
import { MessageList } from '#/components/message-list'
import { Composer } from '#/components/composer'
import { MessageBlocks } from '#/components/message-block'
import { Button } from '#/components/ui/button'

interface ThreadViewProps {
  threadId: string | null
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const stickInstance = useStickToBottom({ initial: 'instant', resize: 'smooth' })
  const chat = useChatStream()
  const { activeThreadId, attach, reset } = chat

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['threads'] })
  }, [activeThreadId, queryClient])

  useEffect(() => {
    if (threadId === null) return
    let cancelled = false
    attach(threadId)
      .then(async (result) => {
        if (cancelled || !result) return
        queryClient.removeQueries({ queryKey: ['messages', result.thread_id] })
        await queryClient.fetchQuery(messagesQueryOptions(result.thread_id))
        if (cancelled) return
        reset()
        queryClient.invalidateQueries({ queryKey: ['cost'] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [threadId, attach, reset, queryClient])

  async function handleSend(text: string) {
    void stickInstance.scrollToBottom()
    const result = await chat.send(text, threadId)
    if (!result) return
    queryClient.removeQueries({ queryKey: ['messages', result.thread_id] })
    await queryClient.fetchQuery(messagesQueryOptions(result.thread_id))
    chat.reset()
    queryClient.invalidateQueries({ queryKey: ['cost'] })
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
  const hasLiveContent =
    chat.pendingUserMessage !== null ||
    chat.blocks.length > 0 ||
    showThinking

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        instance={stickInstance}
        className="relative min-h-0 flex-1"
      >
        <StickToBottom.Content className="flex flex-col">
          {threadId !== null && <MessageList threadId={threadId} />}
          {hasLiveContent && (
            <div className="flex flex-col gap-3 p-4 pt-0">
              {chat.pendingUserMessage !== null && (
                <div className="max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {chat.pendingUserMessage}
                  </pre>
                </div>
              )}
              {chat.blocks.length > 0 && <MessageBlocks blocks={chat.blocks} />}
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
        streaming={chat.status === 'streaming'}
        onSend={handleSend}
        onStop={chat.abort}
      />
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
