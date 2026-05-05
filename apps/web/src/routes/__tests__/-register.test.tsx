import { vi } from 'vitest'

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}))

import { HttpResponse, http } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { startRegistration } from '@simplewebauthn/browser'
import type { RegistrationResponseJSON } from '@simplewebauthn/browser'
import { server } from '#/test-utils/msw/server'
import { renderWithProviders } from '#/test-utils/render'

const mockRegResponse = {
  id: 'mock-cred-id',
  rawId: 'mock-cred-id',
  response: { clientDataJSON: 'a', attestationObject: 'b' },
  type: 'public-key',
  clientExtensionResults: {},
} as unknown as RegistrationResponseJSON

beforeEach(() => {
  vi.mocked(startRegistration).mockReset()
})

describe('Register route', () => {
  it('happy path: enters name + code, runs ceremony, navigates to /', async () => {
    vi.mocked(startRegistration).mockResolvedValue(mockRegResponse)
    let registerOptionsBody: unknown = null
    server.use(
      http.post('/auth/register/options', async ({ request }) => {
        registerOptionsBody = await request.json()
        return HttpResponse.json({ challenge: 'c' })
      }),
    )

    const { user, router } = await renderWithProviders({
      initialPath: '/register',
    })
    await user.type(screen.getByLabelText(/your name/i), 'Abdi')
    await user.type(screen.getByLabelText(/invite code/i), 'invite-code-123')
    await user.click(screen.getByRole('button', { name: /set up passkey/i }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect(registerOptionsBody).toEqual({ name: 'Abdi', displayName: 'Abdi' })
    expect(startRegistration).toHaveBeenCalledTimes(1)
  })

  it('disables submit until both name and code are filled', async () => {
    const { user } = await renderWithProviders({ initialPath: '/register' })
    const submit = screen.getByRole('button', { name: /set up passkey/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/your name/i), 'Abdi')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/invite code/i), 'x')
    expect(submit).not.toBeDisabled()
  })

  it('shows API error on invalid code', async () => {
    server.use(
      http.post('/auth/register/options', () =>
        HttpResponse.text('invalid registration code', { status: 403 }),
      ),
    )

    const { user } = await renderWithProviders({ initialPath: '/register' })
    await user.type(screen.getByLabelText(/your name/i), 'Abdi')
    await user.type(screen.getByLabelText(/invite code/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /set up passkey/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/403: invalid registration code/i),
      ).toBeInTheDocument()
    })
    expect(startRegistration).not.toHaveBeenCalled()
  })

  it('shows "Cancelled" when user cancels the ceremony', async () => {
    const cancelErr = new Error('cancel')
    cancelErr.name = 'NotAllowedError'
    vi.mocked(startRegistration).mockRejectedValue(cancelErr)

    const { user } = await renderWithProviders({ initialPath: '/register' })
    await user.type(screen.getByLabelText(/your name/i), 'Abdi')
    await user.type(screen.getByLabelText(/invite code/i), 'any')
    await user.click(screen.getByRole('button', { name: /set up passkey/i }))

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
    })
  })
})
