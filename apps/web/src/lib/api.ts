import { queryOptions } from '@tanstack/react-query'

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

async function sendMessage(
  message: string,
  threadId: string | null,
): Promise<SendMessageResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId ?? '', message }),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const parsed = parseSseBlock(block)
      if (parsed?.event === 'done') {
        const data = JSON.parse(parsed.data) as SendMessageResult
        return data
      }
      if (parsed?.event === 'error') {
        const data = JSON.parse(parsed.data) as { message?: string }
        throw new Error(data.message ?? 'agent error')
      }
      sep = buffer.indexOf('\n\n')
    }
  }
  throw new Error('stream ended without done event')
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = ''
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!event) return null
  return { event, data }
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
