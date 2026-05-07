import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { startAuthentication } from '@simplewebauthn/browser'
import { ApiError, api } from '#/lib/api'
import { Button } from '#/components/ui/button'

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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your passkey to continue.
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
