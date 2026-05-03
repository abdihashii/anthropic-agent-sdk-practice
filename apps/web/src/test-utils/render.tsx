import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { useIsMobile } from '#/hooks/use-mobile'
import type { Message, Me } from '#/lib/api'
import { createTestRouter, type TestRouter } from './router'

const defaultMe: Me = {
  userId: 'u_test',
  name: 'Test User',
  displayName: 'Test',
  kid: 'k_test',
  iat: 0,
  exp: 9_999_999_999,
}

interface RenderOptions {
  initialPath?: string
  seedMessages?: Record<string, Array<Message>>
  isMobile?: boolean
}

export interface RenderResult {
  router: TestRouter
  queryClient: QueryClient
  user: ReturnType<typeof userEvent.setup>
}

export async function renderWithProviders(
  options: RenderOptions = {},
): Promise<RenderResult> {
  const { initialPath = '/', seedMessages, isMobile } = options

  if (typeof isMobile === 'boolean') {
    vi.mocked(useIsMobile).mockReturnValue(isMobile)
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
    },
  })

  queryClient.setQueryData(['me'], defaultMe)

  if (seedMessages) {
    for (const [threadId, messages] of Object.entries(seedMessages)) {
      queryClient.setQueryData(['messages', threadId], { messages })
    }
  }

  const router = createTestRouter(queryClient, initialPath)
  await router.load()

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router, queryClient, user: userEvent.setup() }
}
