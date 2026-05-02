import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from '#/lib/api'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/login')({
  component: Login,
})

function Login() {
  const router = useRouter()
  const [token, setToken] = useState('')

  const mutation = useMutation({
    mutationFn: (t: string) => api.devLogin(t),
    onSuccess: () => router.navigate({ to: '/' }),
  })

  const errorMessage =
    mutation.error instanceof ApiError
      ? `${mutation.error.status}: ${mutation.error.message}`
      : mutation.error?.message

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (token.trim()) mutation.mutate(token.trim())
        }}
      >
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the dev-login token to continue.
          </p>
        </div>
        <input
          type="password"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="dev-login token"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={mutation.isPending}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending || !token.trim()}
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </form>
    </div>
  )
}
