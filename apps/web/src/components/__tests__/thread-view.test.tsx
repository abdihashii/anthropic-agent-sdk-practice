import { vi } from 'vitest'

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

import { screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '#/test-utils/msw/server'
import { chatHandler, mockChatStream } from '#/test-utils/msw/chat-stream'
import { renderWithProviders } from '#/test-utils/render'

describe('ThreadView', () => {
  it('shows Stop button while streaming, Send button when idle', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()

    await user.type(screen.getByPlaceholderText('Message…'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByRole('button', { name: 'Stop' })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()

    chat.done({ thread_id: 't_foo', session_id: 's', cost_usd: 0 })

    await screen.findByRole('button', { name: 'Send' })
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  it('clicking Stop POSTs /api/threads/:id/stop with the resolved thread_id', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const stopSpy = vi.fn()
    server.use(
      http.post('/api/threads/:id/stop', ({ params }) => {
        stopSpy(params.id)
        return HttpResponse.json({ ok: true })
      }),
    )
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat.chunk('partial')
    await screen.findByText('partial')

    await user.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(stopSpy).toHaveBeenCalledWith('t_foo'))

    chat.done({ thread_id: 't_foo', session_id: null, cost_usd: 0 })
    await screen.findByRole('button', { name: 'Send' })
  })

  it('navigating mid-stream does not show a dialog and destination renders clean', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [], t_bar: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat.chunk('streaming')
    await screen.findByText('streaming')

    await user.click(screen.getByRole('link', { name: 't_bar' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_bar'),
    )
    expect(screen.queryByText('Stop response?')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await screen.findByRole('button', { name: 'Send' })
    expect(screen.queryByText('streaming')).not.toBeInTheDocument()
  })

  it('first-message auto-nav from / lands on /t/<id> with no dialog', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/',
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_default'),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cross-route nav (/t/foo → /) destination renders clean', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    await user.click(screen.getByRole('link', { name: 'New' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('same-route param swap (/t/foo → /t/bar) destination renders clean', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [], t_bar: [] },
    })

    await user.click(screen.getByRole('link', { name: 't_bar' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_bar'),
    )
    expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Retry button after error re-sends the same message', async () => {
    const chat1 = mockChatStream()
    server.use(chatHandler(chat1))
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'retry-me')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat1.error({ message: 'first failure' })
    await screen.findByText('first failure')

    const chat2 = mockChatStream()
    server.use(chatHandler(chat2))

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    chat2.chunk('second try')
    await screen.findByText('second try')

    chat2.done({ thread_id: 't_foo', session_id: 's', cost_usd: 0 })
    await screen.findByRole('button', { name: 'Send' })
  })

  it('stream ends without done event surfaces error UI', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'incomplete')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat.chunk('partial')
    await screen.findByText('partial')
    chat.close()

    await waitFor(() =>
      expect(
        screen.getByText('stream ended without done event'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('invalidates the threads list when a stream starts', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { queryClient, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await user.type(screen.getByPlaceholderText('Message…'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['threads'] }),
    )

    chat.done({ thread_id: 't_foo', session_id: 's', cost_usd: 0 })
    await screen.findByRole('button', { name: 'Send' })
  })

  it('attaches to an active stream on mount and renders replayed blocks', async () => {
    const chat = mockChatStream()
    server.use(
      http.get('/api/threads/:id/stream', ({ request }) => {
        request.signal.addEventListener('abort', chat.abort)
        return chat.response
      }),
    )
    await renderWithProviders({
      initialPath: '/t/t_foo',
      seedMessages: { t_foo: [] },
    })

    chat.chunk('replay this')
    await screen.findByText('replay this')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    chat.done({ thread_id: 't_foo', session_id: 's', cost_usd: 0 })
    await screen.findByRole('button', { name: 'Send' })
  })
})
