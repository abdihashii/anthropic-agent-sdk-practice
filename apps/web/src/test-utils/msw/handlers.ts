import { HttpResponse, delay, http } from 'msw'
import { mockChatStream } from './chat-stream'

const me = {
  userId: 'u_test',
  name: 'Test User',
  displayName: 'Test',
  kid: 'k_test',
  iat: 0,
  exp: 9_999_999_999,
}

const mockRegistrationOptions = {
  challenge: 'mock-reg-challenge',
  rp: { id: 'localhost', name: 'Test' },
  user: { id: 'mock-user', name: 'user', displayName: 'user' },
  pubKeyCredParams: [],
  timeout: 60_000,
  attestation: 'none',
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
  },
}

const mockAuthenticationOptions = {
  challenge: 'mock-auth-challenge',
  rpId: 'localhost',
  allowCredentials: [],
  userVerification: 'required',
  timeout: 60_000,
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
  http.patch('/auth/me', async ({ request }) => {
    const body = (await request.json()) as { name?: string; displayName?: string }
    return HttpResponse.json({
      ...me,
      name: body.name ?? me.name,
      displayName: body.displayName ?? body.name ?? me.displayName,
    })
  }),
  http.post('/auth/register/options', () =>
    HttpResponse.json(mockRegistrationOptions),
  ),
  http.post('/auth/register/verify', () =>
    HttpResponse.json({ ok: true, userId: 'u_new' }),
  ),
  http.post('/auth/login/options', () =>
    HttpResponse.json(mockAuthenticationOptions),
  ),
  http.post('/auth/login/verify', () =>
    HttpResponse.json({ ok: true, userId: 'u_test' }),
  ),
  http.post('/auth/credentials/add/options', () =>
    HttpResponse.json(mockRegistrationOptions),
  ),
  http.post('/auth/credentials/add/verify', () =>
    HttpResponse.json({ ok: true, credentialId: 'c_new' }),
  ),
  http.get('/auth/credentials', () =>
    HttpResponse.json({ credentials: [] }),
  ),
  http.delete('/auth/credentials/:id', () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post('/auth/logout', () => HttpResponse.json({ ok: true })),
  http.get('/api/threads', () =>
    HttpResponse.json({ threads: defaultThreads }),
  ),
  http.get('/api/cost', () =>
    HttpResponse.json({
      window_days: 7,
      total_turns: 0,
      total_cost_usd: 0,
      cache_hit_ratio: 0,
      tool_success_rate: null,
      latency_p50_ms: null,
      latency_p95_ms: null,
      subagent_count_total: 0,
      classifier_fallback_rate: 0,
      weekly_by_model: [],
      tier_distribution: {},
    }),
  ),
  http.get('/api/threads/:id/messages', async () => {
    await delay(10)
    return HttpResponse.json({ messages: [] })
  }),
  http.post('/api/chat', ({ request }) => {
    const chat = mockChatStream()
    request.signal.addEventListener('abort', chat.abort)
    setTimeout(
      () =>
        chat.done({
          thread_id: 't_default',
          session_id: 's_default',
          cost_usd: 0,
        }),
      10,
    )
    return chat.response
  }),
]
