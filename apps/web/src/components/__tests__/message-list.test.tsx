import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Message } from '#/lib/api'
import { server } from '#/test-utils/msw/server'
import { MessageList } from '../message-list'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
    },
  })
}

function renderList(threadId: string, qc: QueryClient = makeQueryClient()) {
  render(
    <QueryClientProvider client={qc}>
      <MessageList threadId={threadId} />
    </QueryClientProvider>,
  )
  return { qc }
}

describe('MessageList', () => {
  it('shows "Loading…" while the query is pending', () => {
    server.use(
      http.get('/api/threads/:id/messages', async () => {
        await delay('infinite')
        return HttpResponse.json({ messages: [] })
      }),
    )
    renderList('t_loading')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows "Failed to load." when the query errors', async () => {
    server.use(
      http.get('/api/threads/:id/messages', () =>
        HttpResponse.text('boom', { status: 500 }),
      ),
    )
    renderList('t_err')
    await waitFor(() =>
      expect(screen.getByText('Failed to load.')).toBeInTheDocument(),
    )
  })

  it('renders nothing when messages array is empty', async () => {
    const { container } = renderList('t_empty') as unknown as {
      container: HTMLElement
      qc: QueryClient
    }
    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
    )
    expect(container?.textContent ?? '').toBe('')
  })

  it('renders a user message verbatim in a primary bubble', async () => {
    const qc = makeQueryClient()
    const messages: Array<Message> = [
      {
        id: 'm1',
        role: 'user',
        content: 'hello there\nline two',
        content_blocks: null,
        created_at: '2026-05-01T00:00:00Z',
      },
    ]
    qc.setQueryData(['messages', 't_user'], { messages })
    renderList('t_user', qc)
    expect(screen.getByText(/hello there/)).toBeInTheDocument()
  })

  it('renders an assistant message with content_blocks via MessageBlocks', async () => {
    const qc = makeQueryClient()
    const messages: Array<Message> = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'flattened',
        content_blocks: [
          { type: 'text', text: 'hello from blocks' },
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: '/x' },
          },
        ],
        created_at: '2026-05-01T00:00:00Z',
      },
    ]
    qc.setQueryData(['messages', 't_blocks'], { messages })
    renderList('t_blocks', qc)
    expect(screen.getByText('hello from blocks')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
  })

  it('renders an assistant message without content_blocks via AssistantMarkdown (legacy fallback)', async () => {
    const qc = makeQueryClient()
    const messages: Array<Message> = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'plain assistant text',
        content_blocks: null,
        created_at: '2026-05-01T00:00:00Z',
      },
    ]
    qc.setQueryData(['messages', 't_legacy'], { messages })
    renderList('t_legacy', qc)
    expect(screen.getByText('plain assistant text')).toBeInTheDocument()
  })
})
