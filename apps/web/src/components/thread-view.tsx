import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ApiError, api, messagesQueryOptions } from '#/lib/api'
import { MessageList } from '#/components/message-list'
import { Composer } from '#/components/composer'

interface ThreadViewProps {
  threadId: string | null
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSend(text: string) {
    setPendingUserMessage(text)
    setErrorMessage(null)
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
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
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
      </div>
      {errorMessage && (
        <p className="px-4 pb-2 text-sm text-destructive" role="alert">
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
