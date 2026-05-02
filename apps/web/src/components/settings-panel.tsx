import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { SettingsIcon } from 'lucide-react'
import { api } from '#/lib/api'
import { useTheme, type Theme } from '#/hooks/use-theme'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet'
import { Button } from '#/components/ui/button'

const THEMES: ReadonlyArray<Theme> = ['light', 'dark', 'auto']

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear()
      setOpen(false)
      router.navigate({ to: '/login' })
    },
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <SettingsIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 p-4">
          <div>
            <p className="mb-2 text-sm font-medium">Theme</p>
            <div className="flex gap-2">
              {THEMES.map((t) => (
                <Button
                  key={t}
                  variant={theme === t ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 capitalize"
                  onClick={() => setTheme(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            {logoutMutation.isPending ? 'Logging out…' : 'Log out'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
