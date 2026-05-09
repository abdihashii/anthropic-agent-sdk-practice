import {
  Link,
  Outlet,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { meQueryOptions } from '#/lib/api'
import { ThreadView } from '#/components/thread-view'
import { Login } from '#/routes/login'
import { Register } from '#/routes/register'
import { CostPage } from '#/routes/_authed/cost'
import { SettingsPanel } from '#/components/settings-panel'

const TEST_THREAD_IDS = ['t_foo', 't_bar', 't_default'] as const

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
})

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions())
    } catch {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthedTestLayout,
})

function AuthedTestLayout() {
  return (
    <div>
      <nav data-testid="test-thread-nav">
        <Link to="/">New</Link>
        {TEST_THREAD_IDS.map((id) => (
          <Link
            key={id}
            to="/t/$threadId"
            params={{ threadId: id }}
          >
            {id}
          </Link>
        ))}
        <SettingsPanel />
      </nav>
      <Outlet />
    </div>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: () => <ThreadView threadId={null} />,
})

const threadRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/t/$threadId',
  component: function ThreadRoute() {
    const { threadId } = threadRoute.useParams()
    return <ThreadView threadId={threadId} />
  },
})

const costRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/cost',
  component: CostPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: Register,
})

const routeTree = rootRoute.addChildren([
  authedRoute.addChildren([indexRoute, threadRoute, costRoute]),
  loginRoute,
  registerRoute,
])

export function createTestRouter(
  queryClient: QueryClient,
  initialPath: string,
) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    context: { queryClient },
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })
}

export type TestRouter = ReturnType<typeof createTestRouter>
