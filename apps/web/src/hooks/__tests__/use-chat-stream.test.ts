import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { chatHandler, mockChatStream } from '#/test-utils/msw/chat-stream'
import { server } from '#/test-utils/msw/server'
import { useChatStream } from '../use-chat-stream'

describe('useChatStream', () => {
  describe('initial state', () => {
    it('starts idle with no blocks, no error, no pendingUserMessage', () => {
      const { result } = renderHook(() => useChatStream())
      expect(result.current.status).toBe('idle')
      expect(result.current.blocks).toEqual([])
      expect(result.current.errorMessage).toBeNull()
      expect(result.current.pendingUserMessage).toBeNull()
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
    it('abort() aborts in-flight fetch and resets to idle without setting error', async () => {
      const chat = mockChatStream()
      server.use(chatHandler(chat))
      const { result } = renderHook(() => useChatStream())
      let sendPromise!: Promise<unknown>
      act(() => {
        sendPromise = result.current.send('hi', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat.chunk('partial')
      await waitFor(() =>
        expect(result.current.blocks).toEqual([
          { type: 'text', text: 'partial' },
        ]),
      )
      act(() => result.current.abort())
      const sendResult = await sendPromise
      expect(sendResult).toBeNull()
      await waitFor(() => expect(result.current.status).toBe('idle'))
      expect(result.current.errorMessage).toBeNull()
      expect(result.current.blocks).toEqual([])
    })

    it('a new send() during streaming aborts the previous send (no double-fire)', async () => {
      const chat1 = mockChatStream()
      server.use(chatHandler(chat1))
      const { result } = renderHook(() => useChatStream())
      let firstSend!: Promise<unknown>
      act(() => {
        firstSend = result.current.send('first', null)
      })
      await waitFor(() => expect(result.current.status).toBe('streaming'))
      chat1.chunk('one')
      await waitFor(() =>
        expect(result.current.blocks).toEqual([{ type: 'text', text: 'one' }]),
      )

      const chat2 = mockChatStream()
      server.use(chatHandler(chat2))
      let secondSend!: Promise<unknown>
      act(() => {
        secondSend = result.current.send('second', null)
      })

      const firstResult = await firstSend
      expect(firstResult).toBeNull()

      await waitFor(() => expect(result.current.pendingUserMessage).toBe('second'))
      expect(result.current.blocks).toEqual([])

      chat2.done({ thread_id: 't', session_id: 's', cost_usd: 0 })
      await secondSend
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
