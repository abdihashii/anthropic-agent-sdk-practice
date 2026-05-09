import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatHandler, mockChatStream } from '#/test-utils/msw/chat-stream'
import { server } from '#/test-utils/msw/server'
import { useChatStream } from '../use-chat-stream'

describe('useChatStream', () => {
  describe('initial state', () => {
    it('starts idle with no blocks, no error, no pendingUserMessage, no activeThreadId', () => {
      const { result } = renderHook(() => useChatStream())
      expect(result.current.status).toBe('idle')
      expect(result.current.blocks).toEqual([])
      expect(result.current.errorMessage).toBeNull()
      expect(result.current.pendingUserMessage).toBeNull()
      expect(result.current.activeThreadId).toBeNull()
    })
  })

  describe('activeThreadId lifecycle', () => {
    it('transitions null → input → resolved → null over send', async () => {
      const chat = mockChatStream()
      server.use(chatHandler(chat))
      const { result } = renderHook(() => useChatStream())
      expect(result.current.activeThreadId).toBeNull()

      let p!: Promise<unknown>
      act(() => {
        p = result.current.send('hi', null)
      })
      await waitFor(() =>
        expect(result.current.activeThreadId).toBeNull(),
      )
      // Initial input was null (draft); resolved comes via 'started' event.
      chat.started({ thread_id: 't_resolved' })
      await waitFor(() =>
        expect(result.current.activeThreadId).toBe('t_resolved'),
      )
      chat.done({ thread_id: 't_resolved', session_id: 's', cost_usd: 0 })
      await p
      await waitFor(() =>
        expect(result.current.activeThreadId).toBeNull(),
      )
    })

    it('transitions to threadId then null over attach', async () => {
      const chat = mockChatStream()
      server.use(
        http.get('/api/threads/:id/stream', ({ request }) => {
          request.signal.addEventListener('abort', chat.abort)
          return chat.response
        }),
      )
      const { result } = renderHook(() => useChatStream())
      let p!: Promise<unknown>
      act(() => {
        p = result.current.attach('t_live')
      })
      await waitFor(() =>
        expect(result.current.activeThreadId).toBe('t_live'),
      )
      chat.done({ thread_id: 't_live', session_id: 's', cost_usd: 0 })
      await p
      await waitFor(() =>
        expect(result.current.activeThreadId).toBeNull(),
      )
    })
  })

  describe('send → success', () => {
    let chat: ReturnType<typeof mockChatStream>

    beforeEach(() => {
      chat = mockChatStream()
      server.use(chatHandler(chat))
    })

    it('flips status to streaming and sets pendingUserMessage', async () => {
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hello', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      expect(result.current.pendingUserMessage).toBe('hello')
      chat.done({ thread_id: 't', session_id: 's', cost_usd: 0 })
      await sendPromise
    })

    it('consecutive chunk events append into a single text block', async () => {
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.chunk('Hello ')
      chat.chunk('world')
      await waitFor(() =>
        expect(result.current.blocks).toEqual([
          { type: 'text', text: 'Hello world' },
        ]),
      )
      chat.done({ thread_id: 't', session_id: 's', cost_usd: 0 })
      await sendPromise
    })

    it('tool_use event creates a separate block after the text block', async () => {
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.chunk('hi')
      chat.toolUse({ id: 'tu_1', name: 'Read', input: { path: '/x' } })
      await waitFor(() => expect(result.current.blocks).toHaveLength(2))
      expect(result.current.blocks[0]).toEqual({ type: 'text', text: 'hi' })
      expect(result.current.blocks[1]).toMatchObject({
        type: 'tool_use',
        id: 'tu_1',
        name: 'Read',
      })
      chat.done({ thread_id: 't', session_id: 's', cost_usd: 0 })
      await sendPromise
    })

    it('returns {thread_id, session_id} on done and resets status to idle', async () => {
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.done({ thread_id: 't_new', session_id: 's_1', cost_usd: 0.05 })
      const sendResult = await sendPromise
      expect(sendResult).toEqual({
        thread_id: 't_new',
        session_id: 's_1',
        cost_usd: 0.05,
      })
      await waitFor(() => expect(result.current.status).toBe('idle'))
    })

    it('started event updates the active threadId for abort routing', async () => {
      const stopSpy = vi.fn()
      server.use(
        http.post('/api/threads/:id/stop', ({ params }) => {
          stopSpy(params.id)
          return HttpResponse.json({ ok: true })
        }),
      )
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.started({ thread_id: 't_resolved' })
      await waitFor(() => expect(result.current.blocks).toEqual([]))
      act(() => result.current.abort())
      await waitFor(() => expect(stopSpy).toHaveBeenCalledWith('t_resolved'))
      chat.done({ thread_id: 't_resolved', session_id: 's', cost_usd: 0 })
      await sendPromise
    })
  })

  describe('send → error', () => {
    it('SSE error frame → status=error, errorMessage set, send rejects', async () => {
      const chat = mockChatStream()
      server.use(chatHandler(chat))
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.error({ message: 'boom' })
      await expect(sendPromise).rejects.toThrow('boom')
      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.errorMessage).toBe('boom')
    })

    it('non-2xx response → status=error, errorMessage formatted as "<status>: <body>"', async () => {
      server.use(
        http.post('/api/chat', () =>
          HttpResponse.text('server bork', { status: 500 }),
        ),
      )
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await expect(sendPromise).rejects.toThrow('server bork')
      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.errorMessage).toBe('500: server bork')
    })
  })

  describe('abort', () => {
    it('abort() POSTs /api/threads/:id/stop and lets server-emitted done resolve send', async () => {
      const chat = mockChatStream()
      server.use(chatHandler(chat))
      const stopSpy = vi.fn()
      server.use(
        http.post('/api/threads/:id/stop', ({ params }) => {
          stopSpy(params.id)
          return HttpResponse.json({ ok: true })
        }),
      )
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', 't_abc')
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.chunk('partial')
      await waitFor(() =>
        expect(result.current.blocks).toEqual([
          { type: 'text', text: 'partial' },
        ]),
      )
      act(() => result.current.abort())
      await waitFor(() => expect(stopSpy).toHaveBeenCalledWith('t_abc'))
      chat.done({ thread_id: 't_abc', session_id: null, cost_usd: 0 })
      const sendResult = await sendPromise
      expect(sendResult).toMatchObject({ thread_id: 't_abc' })
      await waitFor(() => expect(result.current.status).toBe('idle'))
      expect(result.current.errorMessage).toBeNull()
    })

    it('abort() with no active threadId is a no-op (no /stop call)', async () => {
      const stopSpy = vi.fn()
      server.use(
        http.post('/api/threads/:id/stop', ({ params }) => {
          stopSpy(params.id)
          return HttpResponse.json({ ok: true })
        }),
      )
      const { result } = renderHook(() => useChatStream())
      act(() => result.current.abort())
      expect(stopSpy).not.toHaveBeenCalled()
    })
  })

  describe('attach', () => {
    it('returns null when /stream returns 404', async () => {
      const { result } = renderHook(() => useChatStream())
      let p!: Promise<unknown>
      act(() => {
        p = result.current.attach('t_no_stream')
      })
      const r = await p
      expect(r).toBeNull()
      expect(result.current.status).toBe('idle')
    })

    it('consumes a live /stream response and resolves on done', async () => {
      const chat = mockChatStream()
      server.use(
        http.get('/api/threads/:id/stream', ({ request }) => {
          request.signal.addEventListener('abort', chat.abort)
          return chat.response
        }),
      )
      const { result } = renderHook(() => useChatStream())
      let p!: Promise<unknown>
      act(() => {
        p = result.current.attach('t_live')
      })
      chat.chunk('replayed')
      await waitFor(() =>
        expect(result.current.blocks).toEqual([
          { type: 'text', text: 'replayed' },
        ]),
      )
      expect(result.current.status).toBe('streaming')
      chat.done({ thread_id: 't_live', session_id: 's', cost_usd: 0 })
      const r = await p
      expect(r).toMatchObject({ thread_id: 't_live' })
      await waitFor(() => expect(result.current.status).toBe('idle'))
    })
  })

  describe('cleanup', () => {
    it('aborts in-flight fetch on unmount', async () => {
      const chat = mockChatStream()
      server.use(chatHandler(chat))
      const { result, unmount } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      unmount()
      const sendResult = await sendPromise
      expect(sendResult).toBeNull()
    })
  })
})
