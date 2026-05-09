import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { ThreadList } from '#/components/thread-list'
import { server } from '#/test-utils/msw/server'
import type { Thread } from '#/lib/api'

function renderThreadList(threads: Array<Thread>) {
  server.use(
    http.get('/api/threads', () => HttpResponse.json({ threads })),
  )

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })

  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()(
    { component: () => <Outlet /> },
  )
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ThreadList />,
  })
  const threadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/t/$threadId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, threadRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const baseRow = {
  created_at: '2026-05-09T00:00:00Z',
  updated_at: '2026-05-09T00:00:00Z',
}

describe('ThreadList', () => {
  it('renders a streaming dot when is_streaming is true', async () => {
    renderThreadList([
      { id: 't_streaming', title: 'Streaming thread', ...baseRow, is_streaming: true },
    ])
    await screen.findByText('Streaming thread')
    expect(screen.getByLabelText('streaming')).toBeInTheDocument()
  })

  it('does not render a streaming dot when is_streaming is false or missing', async () => {
    renderThreadList([
      { id: 't_idle', title: 'Idle thread', ...baseRow, is_streaming: false },
      { id: 't_legacy', title: 'Legacy thread', ...baseRow },
    ])
    await screen.findByText('Idle thread')
    await screen.findByText('Legacy thread')
    expect(screen.queryByLabelText('streaming')).toBeNull()
  })
})
