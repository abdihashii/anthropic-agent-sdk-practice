import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '#/test-utils/msw/server'
import { ApiError, api } from '../api'

describe('api', () => {
  describe('me', () => {
    it('returns the current user from /auth/me', async () => {
      const me = await api.me()
      expect(me.userId).toBe('u_test')
    })

    it('throws ApiError on non-2xx', async () => {
      server.use(
        http.get('/auth/me', () =>
          HttpResponse.text('unauth', { status: 401 }),
        ),
      )
      await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe('devLogin', () => {
    it('POSTs to /auth/dev-login with x-dev-login-token header', async () => {
      let receivedHeader: string | null = null
      server.use(
        http.post('/auth/dev-login', ({ request }) => {
          receivedHeader = request.headers.get('x-dev-login-token')
          return HttpResponse.json({ ok: true, userId: 'u_dev' })
        }),
      )
      const result = await api.devLogin('secret-token')
      expect(receivedHeader).toBe('secret-token')
      expect(result).toEqual({ ok: true, userId: 'u_dev' })
    })

    it('throws ApiError on auth failure', async () => {
      server.use(
        http.post('/auth/dev-login', () =>
          HttpResponse.text('bad token', { status: 403 }),
        ),
      )
      await expect(api.devLogin('wrong')).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe('logout', () => {
    it('POSTs to /auth/logout and resolves on success', async () => {
      server.use(
        http.post('/auth/logout', () => HttpResponse.json({ ok: true })),
      )
      const result = await api.logout()
      expect(result).toEqual({ ok: true })
    })
  })

  describe('listThreads', () => {
    it('GETs /api/threads and returns the threads array', async () => {
      const result = await api.listThreads()
      expect(result.threads.length).toBeGreaterThan(0)
      expect(result.threads[0]).toHaveProperty('id')
    })
  })

  describe('getMessages', () => {
    it('GETs /api/threads/:id/messages with URL-encoded id', async () => {
      let receivedPath: string | null = null
      server.use(
        http.get('/api/threads/:id/messages', ({ request }) => {
          receivedPath = new URL(request.url).pathname
          return HttpResponse.json({ messages: [] })
        }),
      )
      await api.getMessages('thread/with/slashes')
      expect(receivedPath).toBe(
        '/api/threads/thread%2Fwith%2Fslashes/messages',
      )
    })
  })

  describe('ApiError text fallback', () => {
    it('uses statusText when reading body fails', async () => {
      server.use(
        http.get('/auth/me', () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stream = new ReadableStream({
            start(c) {
              c.error(new Error('body broken'))
            },
          })
          return new HttpResponse(stream, {
            status: 500,
            statusText: 'Internal Server Error',
          })
        }),
      )
      try {
        await api.me()
        throw new Error('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        if (err instanceof ApiError) {
          expect(err.status).toBe(500)
          expect(err.message).toBe('Internal Server Error')
        }
      }
    })
  })
})
