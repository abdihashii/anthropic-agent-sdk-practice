import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { PencilIcon, SettingsIcon, Trash2Icon } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { startRegistration } from '@simplewebauthn/browser'
import {
  ApiError,
  api,
  credentialsQueryOptions,
  meQueryOptions,
} from '#/lib/api'
import type { Credential } from '#/lib/api'
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

  const addPasskeyMutation = useMutation({
    mutationFn: async () => {
      const optionsJSON = await api.credentialsAddOptions()
      const response = await startRegistration({ optionsJSON })
      return api.credentialsAddVerify({ response })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })

  const deleteCredentialMutation = useMutation({
    mutationFn: (id: string) => api.deleteCredential(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })

  const { data: me } = useQuery(meQueryOptions())
  const signedInAs = me?.displayName ?? me?.name ?? me?.userId

  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const updateMeMutation = useMutation({
    mutationFn: (name: string) => api.updateMe({ name }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      setEditingName(false)
    },
  })

  const startEditName = () => {
    setDraftName(me?.name ?? me?.displayName ?? '')
    updateMeMutation.reset()
    setEditingName(true)
  }
  const cancelEditName = () => {
    updateMeMutation.reset()
    setEditingName(false)
  }
  const saveEditName = () => {
    if (draftName.trim()) updateMeMutation.mutate(draftName.trim())
  }

  const { data: credentialsData } = useQuery(credentialsQueryOptions())
  const credentials = credentialsData?.credentials ?? []

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
          {signedInAs &&
            (editingName ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Your name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    disabled={updateMeMutation.isPending}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={saveEditName}
                    disabled={
                      !draftName.trim() || updateMeMutation.isPending
                    }
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEditName}
                    disabled={updateMeMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
                {updateMeMutation.error && (
                  <p className="text-sm text-destructive">
                    {formatApiError(updateMeMutation.error)}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <p className="text-sm text-muted-foreground">
                  Signed in as {signedInAs}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Edit name"
                  onClick={startEditName}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
              </div>
            ))}
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
          <div>
            <p className="mb-2 text-sm font-medium">Passkeys</p>
            {credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="space-y-1">
                {credentials.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-sm tabular-nums"
                  >
                    <span className="text-muted-foreground">
                      {formatCredential(c)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove passkey ${c.id}`}
                      disabled={
                        deleteCredentialMutation.isPending &&
                        deleteCredentialMutation.variables === c.id
                      }
                      onClick={() => {
                        if (window.confirm('Remove this passkey?')) {
                          deleteCredentialMutation.mutate(c.id)
                        }
                      }}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {deleteCredentialMutation.error && (
              <p className="mt-2 text-sm text-destructive">
                {formatApiError(deleteCredentialMutation.error)}
              </p>
            )}
            <Button
              variant="outline"
              className="mt-3 w-full"
              disabled={addPasskeyMutation.isPending}
              onClick={() => addPasskeyMutation.mutate()}
            >
              {addPasskeyMutation.isPending ? 'Adding…' : 'Add passkey'}
            </Button>
            {addPasskeyMutation.isSuccess && (
              <p className="mt-2 text-sm text-muted-foreground">
                Passkey added.
              </p>
            )}
            {addPasskeyMutation.error && (
              <p className="mt-2 text-sm text-destructive">
                {formatAddPasskeyError(addPasskeyMutation.error)}
              </p>
            )}
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

function formatCredential(c: Credential): string {
  const date = new Date(c.createdAt).toLocaleDateString()
  const transports = c.transports?.length ? c.transports.join(', ') : 'passkey'
  return `${date} · ${transports}`
}

function formatAddPasskeyError(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Cancelled'
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return 'A passkey already exists for this device.'
  }
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Add passkey failed'
}

function formatApiError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Failed'
}
