import { vi } from 'vitest'

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

vi.mock('#/components/ui/drawer', async () => {
  const React = await import('react')
  const DrawerCtx = React.createContext<
    ((open: boolean) => void) | undefined
  >(undefined)
  return {
    Drawer: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange: (open: boolean) => void
      children: React.ReactNode
    }) =>
      open
        ? React.createElement(
            DrawerCtx.Provider,
            { value: onOpenChange },
            React.createElement('div', { role: 'dialog' }, children),
          )
        : null,
    DrawerContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    DrawerHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    DrawerTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DrawerDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DrawerFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    DrawerClose: ({
      children,
      asChild,
    }: {
      children: React.ReactNode
      asChild?: boolean
    }) => {
      const onOpenChange = React.useContext(DrawerCtx)
      const handleClick = () => onOpenChange?.(false)
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, {
          onClick: handleClick,
        } as Partial<React.HTMLAttributes<HTMLElement>>)
      }
      return React.createElement('button', { onClick: handleClick }, children)
    },
  }
})

import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useIsMobile } from '#/hooks/use-mobile'
import { server } from '#/test-utils/msw/server'
import { chatHandler, mockChatStream } from '#/test-utils/msw/chat-stream'
import { renderWithProviders } from '#/test-utils/render'

const PROMPT_TEXT = 'Stop response?'

describe.each([
  { label: 'desktop (AlertDialog)', isMobile: false },
  { label: 'mobile (Drawer)', isMobile: true },
])('ThreadView — $label', ({ isMobile }) => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(isMobile)
  })

  it('Scenario 1: Stay mid-stream — response keeps streaming, URL unchanged', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
      seedMessages: { t_foo: [], t_bar: [] },
    })

    const textarea = screen.getByPlaceholderText('Message…')
    await user.type(textarea, 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat.chunk('responding')
    await screen.findByText('responding')

    await user.click(screen.getByRole('link', { name: 't_bar' }))
    await screen.findByText(PROMPT_TEXT)

    await user.click(screen.getByRole('button', { name: 'Stay' }))
    await waitFor(() =>
      expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument(),
    )
    expect(router.state.location.pathname).toBe('/t/t_foo')

    chat.chunk(' more')
    await screen.findByText('responding more')

    chat.done({ thread_id: 't_foo', session_id: 's', cost_usd: 0 })
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled(),
    )
  })

  it('Scenario 2: Leave mid-stream — destination renders clean, no stale streaming state', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
      seedMessages: { t_foo: [], t_bar: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat.chunk('partial')
    await screen.findByText('partial')

    await user.click(screen.getByRole('link', { name: 't_bar' }))
    await screen.findByText(PROMPT_TEXT)

    await user.click(screen.getByRole('button', { name: 'Leave' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_bar'),
    )
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled(),
    )
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument()
    expect(screen.queryByText('partial')).not.toBeInTheDocument()
    expect(screen.queryByText('hello')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Scenario 3: First-message auto-nav — no spurious dialog (closure-staleness regression)', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/',
      isMobile,
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_default'),
    )
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Scenario 4: Abort then immediate resend — no stale error UI', async () => {
    const chat1 = mockChatStream()
    server.use(chatHandler(chat1))
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
      seedMessages: { t_foo: [], t_bar: [] },
    })

    await user.type(screen.getByPlaceholderText('Message…'), 'first')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat1.chunk('first response')
    await screen.findByText('first response')

    await user.click(screen.getByRole('link', { name: 't_bar' }))
    await screen.findByText(PROMPT_TEXT)
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_bar'),
    )

    const chat2 = mockChatStream()
    server.use(chatHandler(chat2))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Message…'), 'second')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    chat2.chunk('second response')
    await screen.findByText('second response')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    chat2.done({ thread_id: 't_bar', session_id: 's', cost_usd: 0 })
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled(),
    )
  })

  it('Scenario 5a: Cross-route nav (/t/foo → /) — destination renders clean', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
      seedMessages: { t_foo: [] },
    })

    await user.click(screen.getByRole('link', { name: 'New' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('Scenario 6: Retry button after error re-sends the same message', async () => {
    const chat1 = mockChatStream()
    server.use(chatHandler(chat1))
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
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
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled(),
    )
  })

  it('Scenario 7: stream ends without done event surfaces error UI', async () => {
    const chat = mockChatStream()
    server.use(chatHandler(chat))
    const { user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
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

  it('Scenario 5b: Same-route param swap (/t/foo → /t/bar) — destination renders clean', async () => {
    const { router, user } = await renderWithProviders({
      initialPath: '/t/t_foo',
      isMobile,
      seedMessages: { t_foo: [], t_bar: [] },
    })

    await user.click(screen.getByRole('link', { name: 't_bar' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/t/t_bar'),
    )
    expect(screen.getByPlaceholderText('Message…')).not.toBeDisabled()
    expect(screen.queryByText(PROMPT_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
