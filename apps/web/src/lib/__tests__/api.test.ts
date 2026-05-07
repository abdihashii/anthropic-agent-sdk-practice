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

  describe('logout', () => {
    it('POSTs to /auth/logout and resolves on success', async () => {
      server.use(
        http.post('/auth/logout', () => HttpResponse.json({ ok: true })),
      )
      const result = await api.logout()
      expect(result).toEqual({ ok: true })
    })
  })

  describe('updateMe', () => {
    it('PATCHes /auth/me with name body and returns refreshed Me', async () => {
      let receivedBody: unknown = null
      server.use(
        http.patch('/auth/me', async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json({
            userId: 'u_test',
            name: 'Abdi',
            displayName: 'Abdi',
            kid: 'k',
            iat: 0,
            exp: 1,
          })
        }),
      )
      const result = await api.updateMe({ name: 'Abdi' })
      expect(receivedBody).toEqual({ name: 'Abdi' })
      expect(result.name).toBe('Abdi')
    })
  })

  describe('registerOptions', () => {
    it('POSTs body + x-registration-code header', async () => {
      let received: { code: string | null; body: unknown } = {
        code: null,
        body: null,
      }
      server.use(
        http.post('/auth/register/options', async ({ request }) => {
          received = {
            code: request.headers.get('x-registration-code'),
            body: await request.json(),
          }
          return HttpResponse.json({ challenge: 'c' })
        }),
      )
      const result = await api.registerOptions({
        code: 'invite',
        name: 'abdi',
        displayName: 'Abdi',
      })
      expect(received.code).toBe('invite')
      expect(received.body).toEqual({ name: 'abdi', displayName: 'Abdi' })
      expect(result).toEqual({ challenge: 'c' })
    })

    it('throws ApiError on 403', async () => {
      server.use(
        http.post('/auth/register/options', () =>
          HttpResponse.text('bad code', { status: 403 }),
        ),
      )
      await expect(
        api.registerOptions({ code: 'wrong' }),
      ).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe('registerVerify', () => {
    it('POSTs response body + x-registration-code header', async () => {
      let received: { code: string | null; body: unknown } = {
        code: null,
        body: null,
      }
      server.use(
        http.post('/auth/register/verify', async ({ request }) => {
          received = {
            code: request.headers.get('x-registration-code'),
            body: await request.json(),
          }
          return HttpResponse.json({ ok: true, userId: 'u_new' })
        }),
      )
      const result = await api.registerVerify({
        code: 'invite',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: { id: 'cred-id' } as any,
      })
      expect(received.code).toBe('invite')
      expect(received.body).toEqual({ id: 'cred-id' })
      expect(result).toEqual({ ok: true, userId: 'u_new' })
    })
  })

  describe('loginOptions', () => {
    it('POSTs to /auth/login/options', async () => {
      let receivedMethod: string | null = null
      server.use(
        http.post('/auth/login/options', ({ request }) => {
          receivedMethod = request.method
          return HttpResponse.json({ challenge: 'login-c' })
        }),
      )
      const result = await api.loginOptions()
      expect(receivedMethod).toBe('POST')
      expect(result).toEqual({ challenge: 'login-c' })
    })
  })

  describe('loginVerify', () => {
    it('POSTs response body', async () => {
      let receivedBody: unknown = null
      server.use(
        http.post('/auth/login/verify', async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json({ ok: true, userId: 'u_test' })
        }),
      )
      const result = await api.loginVerify({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: { id: 'cred', response: { signature: 'sig' } } as any,
      })
      expect(receivedBody).toEqual({
        id: 'cred',
        response: { signature: 'sig' },
      })
      expect(result).toEqual({ ok: true, userId: 'u_test' })
    })
  })

  describe('credentialsAddOptions', () => {
    it('POSTs to /auth/credentials/add/options', async () => {
      let receivedMethod: string | null = null
      server.use(
        http.post('/auth/credentials/add/options', ({ request }) => {
          receivedMethod = request.method
          return HttpResponse.json({ challenge: 'add-c' })
        }),
      )
      const result = await api.credentialsAddOptions()
      expect(receivedMethod).toBe('POST')
      expect(result).toEqual({ challenge: 'add-c' })
    })
  })

  describe('credentialsAddVerify', () => {
    it('POSTs response body', async () => {
      let receivedBody: unknown = null
      server.use(
        http.post('/auth/credentials/add/verify', async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json({
            ok: true,
            credentialId: 'new-cred-id',
          })
        }),
      )
      const result = await api.credentialsAddVerify({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: { id: 'new-cred-id' } as any,
      })
      expect(receivedBody).toEqual({ id: 'new-cred-id' })
      expect(result).toEqual({ ok: true, credentialId: 'new-cred-id' })
    })
  })

  describe('listCredentials', () => {
    it('GETs /auth/credentials', async () => {
      server.use(
        http.get('/auth/credentials', () =>
          HttpResponse.json({
            credentials: [
              { id: 'a', createdAt: '2026-05-01', transports: ['internal'] },
            ],
          }),
        ),
      )
      const result = await api.listCredentials()
      expect(result.credentials).toHaveLength(1)
      expect(result.credentials[0].id).toBe('a')
    })
  })

  describe('deleteCredential', () => {
    it('DELETEs /auth/credentials/:id with URL-encoded id', async () => {
      let receivedPath: string | null = null
      server.use(
        http.delete('/auth/credentials/:id', ({ request }) => {
          receivedPath = new URL(request.url).pathname
          return HttpResponse.json({ ok: true })
        }),
      )
      await api.deleteCredential('cred/with/slashes')
      expect(receivedPath).toBe('/auth/credentials/cred%2Fwith%2Fslashes')
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
