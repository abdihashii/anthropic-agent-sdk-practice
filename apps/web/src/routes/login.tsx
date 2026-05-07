import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { ApiError, api } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/login')({
  component: Login,
})

export function Login() {
  const router = useRouter()

  const passkeyMutation = useMutation({
    mutationFn: async () => {
      const optionsJSON = await api.loginOptions()
      const response = await startAuthentication({ optionsJSON })
      return api.loginVerify({ response })
    },
    onSuccess: () => router.navigate({ to: '/' }),
  })

  const [token, setToken] = useState('')
  const devLoginMutation = useMutation({
    mutationFn: (t: string) => api.devLogin(t),
    onSuccess: () => router.navigate({ to: '/' }),
  })

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a passkey to sign in.
          </p>
        </div>
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={passkeyMutation.isPending}
            onClick={() => passkeyMutation.mutate()}
          >
            {passkeyMutation.isPending
              ? 'Signing in…'
              : 'Sign in with passkey'}
          </Button>
          {passkeyMutation.error && (
            <p className="text-sm text-destructive">
              {formatPasskeyError(passkeyMutation.error)}
            </p>
          )}
        </div>
        <div className="border-t pt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dev fallback
          </p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (token.trim()) devLoginMutation.mutate(token.trim())
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="dev-login token"
              disabled={devLoginMutation.isPending}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={devLoginMutation.isPending || !token.trim()}
            >
              {devLoginMutation.isPending ? 'Signing in…' : 'Use dev token'}
            </Button>
            {devLoginMutation.error && (
              <p className="text-sm text-destructive">
                {formatApiError(devLoginMutation.error)}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

function formatPasskeyError(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Cancelled'
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Sign in failed'
}

function formatApiError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Failed'
}
