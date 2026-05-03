import { HttpResponse, http } from 'msw'
import { mockChatStream } from './chat-stream'

const me = {
  userId: 'u_test',
  name: 'Test User',
  displayName: 'Test',
  kid: 'k_test',
  iat: 0,
  exp: 9_999_999_999,
}

const defaultThreads = [
  {
    id: 't_foo',
    title: 'Foo thread',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 't_bar',
    title: 'Bar thread',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  },
]

export const defaultHandlers = [
  http.get('/auth/me', () => HttpResponse.json(me)),
  http.get('/api/threads', () =>
    HttpResponse.json({ threads: defaultThreads }),
  ),
  http.get('/api/threads/:id/messages', () =>
    HttpResponse.json({ messages: [] }),
  ),
  http.post('/api/chat', ({ request }) => {
    const chat = mockChatStream()
    request.signal.addEventListener('abort', chat.abort)
    queueMicrotask(() =>
      chat.done({
        thread_id: 't_default',
        session_id: 's_default',
        cost_usd: 0,
      }),
    )
    return chat.response
  }),
]
