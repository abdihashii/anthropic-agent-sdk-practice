import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  StickToBottom,
  useStickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom'
import { ChevronDownIcon } from 'lucide-react'
import { ApiError, api, messagesQueryOptions } from '#/lib/api'
import { MessageList } from '#/components/message-list'
import { Composer } from '#/components/composer'
import { Button } from '#/components/ui/button'

interface ThreadViewProps {
  threadId: string | null
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const stickInstance = useStickToBottom({ initial: 'instant', resize: 'smooth' })
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSend(text: string) {
    setPendingUserMessage(text)
    setErrorMessage(null)
    void stickInstance.scrollToBottom()
    try {
      const result = await api.sendMessage(text, threadId)
      queryClient.removeQueries({ queryKey: ['messages', result.thread_id] })
      await queryClient.fetchQuery(messagesQueryOptions(result.thread_id))
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      if (threadId === null) {
        router.navigate({
          to: '/t/$threadId',
          params: { threadId: result.thread_id },
        })
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'send failed'
      setErrorMessage(msg)
      throw err
    } finally {
      setPendingUserMessage(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        instance={stickInstance}
        className="relative min-h-0 flex-1"
      >
        <StickToBottom.Content className="flex flex-col">
          {threadId !== null && <MessageList threadId={threadId} />}
          {pendingUserMessage !== null && (
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {pendingUserMessage}
                </pre>
              </div>
              <p className="self-start text-sm italic text-muted-foreground">
                Thinking…
              </p>
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomPill />
      </StickToBottom>
      {errorMessage && (
        <p className="shrink-0 px-4 pb-2 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
      <Composer
        disabled={pendingUserMessage !== null}
        onSend={handleSend}
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
