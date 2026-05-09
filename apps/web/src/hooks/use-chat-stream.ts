import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type SendMessageResult } from '#/lib/api'

export type Block =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: unknown
      parent_tool_use_id?: string
    }

export type StreamStatus = 'idle' | 'streaming' | 'error'

export interface UseChatStreamReturn {
  status: StreamStatus
  pendingUserMessage: string | null
  blocks: Array<Block>
  errorMessage: string | null
  activeThreadId: string | null
  send: (
    text: string,
    threadId: string | null,
  ) => Promise<SendMessageResult | null>
  attach: (threadId: string) => Promise<SendMessageResult | null>
  reset: () => void
  abort: () => void
}

export function useChatStream(): UseChatStreamReturn {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    null,
  )
  const [blocks, setBlocks] = useState<Array<Block>>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
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

  const abort = useCallback(() => {
    if (activeThreadId) void api.stopThread(activeThreadId)
  }, [activeThreadId])

  const onChunk = useCallback((chunk: string) => {
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
  }, [])

  const onToolUse = useCallback(
    (data: {
      id: string
      name: string
      input: unknown
      parent_tool_use_id?: string
    }) => {
      setBlocks((prev) => [...prev, { type: 'tool_use', ...data }])
    },
    [],
  )

  const send = useCallback(
    async (
      text: string,
      threadId: string | null,
    ): Promise<SendMessageResult | null> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setActiveThreadId(threadId)

      setStatus('streaming')
      setPendingUserMessage(text)
      setBlocks([])
      setErrorMessage(null)

      try {
        const result = await api.sendMessage(text, threadId, {
          signal: controller.signal,
          onStart: (resolved) => {
            setActiveThreadId(resolved)
          },
          onChunk,
          onToolUse,
        })
        if (controller.signal.aborted) return null
        setStatus('idle')
        setActiveThreadId(null)
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
        setActiveThreadId(null)
        throw err
      }
    },
    [onChunk, onToolUse],
  )

  const attach = useCallback(
    async (threadId: string): Promise<SendMessageResult | null> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setActiveThreadId(threadId)

      // Clear prior state but defer 'streaming' until first event arrives.
      // This prevents a 'streaming' flicker when /stream returns 404.
      setPendingUserMessage(null)
      setBlocks([])
      setErrorMessage(null)
      setStatus('idle')

      let started = false
      const initStream = () => {
        if (!started) {
          started = true
          setStatus('streaming')
        }
      }

      try {
        const result = await api.attachStream(threadId, {
          signal: controller.signal,
          onStart: initStream,
          onChunk: (chunk) => {
            initStream()
            onChunk(chunk)
          },
          onToolUse: (data) => {
            initStream()
            onToolUse(data)
          },
        })
        if (controller.signal.aborted) return null
        if (started) setStatus('idle')
        setActiveThreadId(null)
        return result
      } catch (err) {
        if (controller.signal.aborted) return null
        const message =
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : 'attach failed'
        if (started) {
          setStatus('error')
          setErrorMessage(message)
        }
        setActiveThreadId(null)
        throw err
      }
    },
    [onChunk, onToolUse],
  )

  return {
    status,
    pendingUserMessage,
    blocks,
    errorMessage,
    activeThreadId,
    send,
    attach,
    reset,
    abort,
  }
}
