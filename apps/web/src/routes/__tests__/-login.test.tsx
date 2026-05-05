import { vi } from 'vitest'

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}))

import { HttpResponse, http } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { startAuthentication } from '@simplewebauthn/browser'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'
import { server } from '#/test-utils/msw/server'
import { renderWithProviders } from '#/test-utils/render'

const mockAuthResponse = {
  id: 'mock-cred-id',
  rawId: 'mock-cred-id',
  response: {
    clientDataJSON: 'a',
    authenticatorData: 'b',
    signature: 'c',
    userHandle: 'd',
  },
  type: 'public-key',
  clientExtensionResults: {},
} as unknown as AuthenticationResponseJSON

beforeEach(() => {
  vi.mocked(startAuthentication).mockReset()
})

describe('Login route', () => {
  describe('passkey sign-in', () => {
    it('navigates to / on successful ceremony + verify', async () => {
      vi.mocked(startAuthentication).mockResolvedValue(mockAuthResponse)

      const { user, router } = await renderWithProviders({
        initialPath: '/login',
      })
      await user.click(
        screen.getByRole('button', { name: /sign in with passkey/i }),
      )

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/')
      })
      expect(startAuthentication).toHaveBeenCalledTimes(1)
    })

    it('shows "Cancelled" when the user cancels the ceremony', async () => {
      const cancelErr = new Error('cancel')
      cancelErr.name = 'NotAllowedError'
      vi.mocked(startAuthentication).mockRejectedValue(cancelErr)

      const { user } = await renderWithProviders({ initialPath: '/login' })
      await user.click(
        screen.getByRole('button', { name: /sign in with passkey/i }),
      )

      await waitFor(() => {
        expect(screen.getByText('Cancelled')).toBeInTheDocument()
      })
    })

    it('surfaces verify-endpoint API error', async () => {
      vi.mocked(startAuthentication).mockResolvedValue(mockAuthResponse)
      server.use(
        http.post('/auth/login/verify', () =>
          HttpResponse.text('unknown credential', { status: 401 }),
        ),
      )

      const { user } = await renderWithProviders({ initialPath: '/login' })
      await user.click(
        screen.getByRole('button', { name: /sign in with passkey/i }),
      )

      await waitFor(() => {
        expect(
          screen.getByText(/401: unknown credential/i),
        ).toBeInTheDocument()
      })
    })
  })

  describe('dev fallback', () => {
    it('signs in via dev token and navigates to /', async () => {
      server.use(
        http.post('/auth/dev-login', () =>
          HttpResponse.json({ ok: true, userId: 'u_dev' }),
        ),
      )

      const { user, router } = await renderWithProviders({
        initialPath: '/login',
      })
      await user.type(
        screen.getByPlaceholderText(/dev-login token/i),
        'secret-token',
      )
      await user.click(screen.getByRole('button', { name: /use dev token/i }))

      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/')
      })
    })

    it('shows API error on dev-login rejection', async () => {
      server.use(
        http.post('/auth/dev-login', () =>
          HttpResponse.text('bad token', { status: 401 }),
        ),
      )

      const { user } = await renderWithProviders({ initialPath: '/login' })
      await user.type(
        screen.getByPlaceholderText(/dev-login token/i),
        'wrong',
      )
      await user.click(screen.getByRole('button', { name: /use dev token/i }))

      await waitFor(() => {
        expect(screen.getByText(/401: bad token/i)).toBeInTheDocument()
      })
    })
  })
})
