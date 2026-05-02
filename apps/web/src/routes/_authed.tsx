import { useState } from 'react'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2Icon, MenuIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Sidebar } from '#/components/sidebar'
import { ThreadList } from '#/components/thread-list'
import { SettingsPanel } from '#/components/settings-panel'
import { useMediaQuery } from '#/hooks/use-media-query'
import { meQueryOptions } from '#/lib/api'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions())
    } catch {
      throw redirect({ to: '/login' })
    }
  },
  pendingComponent: AuthedPending,
  component: AuthedLayout,
})

function AuthedPending() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function AuthedLayout() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <ThreadList onThreadOpen={() => setSidebarOpen(false)} />
      </Sidebar>
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b bg-background/95 px-2 backdrop-blur">
          {!isDesktop ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" />
            </Button>
          ) : (
            <div />
          )}
          <SettingsPanel />
        </header>
        <Outlet />
      </main>
    </div>
  )
}
