import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type SendMessageResult } from '#/lib/api'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

export type StreamStatus = 'idle' | 'streaming' | 'error'

export interface UseChatStreamReturn {
  status: StreamStatus
  pendingUserMessage: string | null
  blocks: Array<Block>
  errorMessage: string | null
  send: (
    text: string,
    threadId: string | null,
  ) => Promise<SendMessageResult | null>
  reset: () => void
}

export function useChatStream(): UseChatStreamReturn {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  )
  const [blocks, setBlocks] = useState<Array<Block>>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setPendingUserMessage(null)
    setBlocks([])
    setErrorMessage(null)
  }, [])

  const send = useCallback(
    async (
      text: string,
      threadId: string | null,
    ): Promise<SendMessageResult | null> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus('streaming')
      setPendingUserMessage(text)
      setBlocks([])
      setErrorMessage(null)

      try {
        const result = await api.sendMessage(text, threadId, {
          signal: controller.signal,
          onChunk: (chunk) => {
            setBlocks((prev) => {
              const last = prev[prev.length - 1]
              if (last && last.type === 'text') {
                return [
                  ...prev.slice(0, -1),
                  { type: 'text', text: last.text + chunk },
                ]
              }
              return [...prev, { type: 'text', text: chunk }]
            })
          },
          onToolUse: (data) => {
            setBlocks((prev) => [...prev, { type: 'tool_use', ...data }])
          },
        })
        return result
      } catch (err) {
        if (controller.signal.aborted) return null
        const message =
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : 'send failed'
        setStatus('error')
        setErrorMessage(message)
        throw err
      }
    },
    [],
  )

  return { status, pendingUserMessage, blocks, errorMessage, send, reset }
}
