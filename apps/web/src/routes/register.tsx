import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { ApiError, api } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export const Route = createFileRoute('/register')({
  component: Register,
})

export function Register() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const mutation = useMutation({
    mutationFn: async (input: { name: string; code: string }) => {
      const optionsJSON = await api.registerOptions({
        name: input.name,
        displayName: input.name,
        code: input.code,
      })
      const response = await startRegistration({ optionsJSON })
      return api.registerVerify({ response, code: input.code })
    },
    onSuccess: () => router.navigate({ to: '/' }),
  })

  const canSubmit = name.trim() && code.trim() && !mutation.isPending

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit)
            mutation.mutate({ name: name.trim(), code: code.trim() })
        }}
      >
        <div>
          <h1 className="text-2xl font-semibold">Set up access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your name and invite code, then create a passkey.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-name">Your name</Label>
          <Input
            id="register-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="registration-code">Invite code</Label>
          <Input
            id="registration-code"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {mutation.isPending ? 'Setting up…' : 'Set up passkey'}
        </Button>
        {mutation.error && (
          <p className="text-sm text-destructive">
            {formatRegisterError(mutation.error)}
          </p>
        )}
      </form>
    </div>
  )
}

function formatRegisterError(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Cancelled'
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return 'A passkey already exists for this device on this account.'
  }
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Registration failed'
}
