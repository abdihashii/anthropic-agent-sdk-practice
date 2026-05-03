import { queryOptions } from '@tanstack/react-query'
import { parseSseStream } from '#/lib/sse'
import type { Block } from '#/hooks/use-chat-stream'

export interface Me {
  userId: string
  name: string | null
  displayName: string | null
  kid: string
  iat: number
  exp: number
}

export interface Thread {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  content_blocks: Array<Block> | null
  created_at: string
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'include' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }
  return (await res.json()) as T
}

export interface SendMessageResult {
  thread_id: string
  session_id: string
}

interface SendMessageCallbacks {
  onChunk: (text: string) => void
  onToolUse: (data: {
    id: string
    name: string
    input: unknown
    parent_tool_use_id?: string
  }) => void
  signal: AbortSignal
}

async function sendMessage(
  message: string,
  threadId: string | null,
  callbacks: SendMessageCallbacks,
): Promise<SendMessageResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId ?? '', message }),
    signal: callbacks.signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }

  for await (const event of parseSseStream(res.body, callbacks.signal)) {
    if (event.type === 'chunk') callbacks.onChunk(event.data.text)
    else if (event.type === 'tool_use') callbacks.onToolUse(event.data)
    else if (event.type === 'done') return event.data
    else if (event.type === 'error') throw new Error(event.data.message)
  }
  throw new Error('stream ended without done event')
}

export const api = {
  me: (): Promise<Me> => apiJson<Me>('/auth/me'),
  devLogin: (token: string): Promise<{ ok: true; userId: string }> =>
    apiJson('/auth/dev-login', {
      method: 'POST',
      headers: { 'x-dev-login-token': token },
    }),
  logout: (): Promise<{ ok: true }> =>
    apiJson('/auth/logout', { method: 'POST' }),
  listThreads: (): Promise<{ threads: Array<Thread> }> =>
    apiJson('/api/threads'),
  getMessages: (threadId: string): Promise<{ messages: Array<Message> }> =>
    apiJson(`/api/threads/${encodeURIComponent(threadId)}/messages`),
  sendMessage,
}

export const meQueryOptions = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: api.me,
    staleTime: 5 * 60 * 1000,
  })

export const threadsQueryOptions = () =>
  queryOptions({
    queryKey: ['threads'],
    queryFn: api.listThreads,
    staleTime: 30_000,
  })

export const messagesQueryOptions = (threadId: string) =>
  queryOptions({
    queryKey: ['messages', threadId],
    queryFn: () => api.getMessages(threadId),
    staleTime: Infinity,
  })
