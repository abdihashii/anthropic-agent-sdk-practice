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

async function openSettings(user: { click: (el: Element) => Promise<void> }) {
  await user.click(screen.getByRole('button', { name: /settings/i }))
  return await screen.findByRole('button', { name: /add passkey/i })
}

describe('SettingsPanel', () => {
  it('shows the signed-in user name from /auth/me', async () => {
    const { user } = await renderWithProviders({ initialPath: '/' })
    await user.click(screen.getByRole('button', { name: /settings/i }))
    expect(
      await screen.findByText(/signed in as test/i),
    ).toBeInTheDocument()
  })

  describe('edit name', () => {
    it('saves a new name and displays it inline', async () => {
      let receivedBody: unknown = null
      server.use(
        http.patch('/auth/me', async ({ request }) => {
          receivedBody = await request.json()
          return HttpResponse.json({
            userId: 'u_test',
            name: 'Abdi',
            displayName: 'Abdi',
            kid: 'k',
            iat: 0,
            exp: 9_999_999_999,
          })
        }),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await user.click(
        await screen.findByRole('button', { name: /edit name/i }),
      )

      const input = screen.getByLabelText(/your name/i) as HTMLInputElement
      // pre-filled with current name (the seeded me.name = "Test User")
      expect(input.value).toBe('Test User')
      await user.clear(input)
      await user.type(input, 'Abdi')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => {
        expect(screen.getByText(/signed in as abdi/i)).toBeInTheDocument()
      })
      expect(receivedBody).toEqual({ name: 'Abdi' })
    })

    it('Cancel reverts edit mode without calling the API', async () => {
      let called = false
      server.use(
        http.patch('/auth/me', () => {
          called = true
          return HttpResponse.json({})
        }),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await user.click(
        await screen.findByRole('button', { name: /edit name/i }),
      )
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()
      expect(screen.getByText(/signed in as test/i)).toBeInTheDocument()
      expect(called).toBe(false)
    })

    it('disables Save when input is empty', async () => {
      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await user.click(
        await screen.findByRole('button', { name: /edit name/i }),
      )
      const input = screen.getByLabelText(/your name/i)
      await user.clear(input)
      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    })

    it('shows API error inline on failure', async () => {
      server.use(
        http.patch('/auth/me', () =>
          HttpResponse.text('name is required', { status: 400 }),
        ),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await user.click(
        await screen.findByRole('button', { name: /edit name/i }),
      )
      const input = screen.getByLabelText(/your name/i)
      await user.clear(input)
      await user.type(input, 'x')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/400: name is required/i),
        ).toBeInTheDocument()
      })
    })
  })

  describe('passkey list', () => {
    it('shows "None yet." when no credentials', async () => {
      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      expect(await screen.findByText('None yet.')).toBeInTheDocument()
    })

    it('renders credentials with formatted date + transports', async () => {
      server.use(
        http.get('/auth/credentials', () =>
          HttpResponse.json({
            credentials: [
              {
                id: 'cred-1',
                createdAt: '2026-05-01T00:00:00.000Z',
                transports: ['internal'],
              },
              {
                id: 'cred-2',
                createdAt: '2026-04-15T00:00:00.000Z',
                transports: ['hybrid', 'usb'],
              },
            ],
          }),
        ),
      )
      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      expect(await screen.findByText(/internal/)).toBeInTheDocument()
      expect(screen.getByText(/hybrid, usb/)).toBeInTheDocument()
    })

    it('refetches the list after a successful add-passkey ceremony', async () => {
      vi.mocked(startRegistration).mockResolvedValue(mockRegResponse)
      let listCalls = 0
      server.use(
        http.get('/auth/credentials', () => {
          listCalls += 1
          return HttpResponse.json({ credentials: [] })
        }),
      )
      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await screen.findByText('None yet.')
      const initialCalls = listCalls
      await user.click(screen.getByRole('button', { name: /add passkey/i }))
      await waitFor(() => {
        expect(screen.getByText(/passkey added/i)).toBeInTheDocument()
      })
      expect(listCalls).toBeGreaterThan(initialCalls)
    })
  })

  describe('remove passkey', () => {
    function seedTwoCredentials() {
      server.use(
        http.get('/auth/credentials', () =>
          HttpResponse.json({
            credentials: [
              {
                id: 'cred-1',
                createdAt: '2026-05-01T00:00:00.000Z',
                transports: ['internal'],
              },
              {
                id: 'cred-2',
                createdAt: '2026-04-15T00:00:00.000Z',
                transports: ['hybrid'],
              },
            ],
          }),
        ),
      )
    }

    it('confirms then DELETEs the credential and refetches the list', async () => {
      seedTwoCredentials()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      let deletedId: string | null = null
      server.use(
        http.delete('/auth/credentials/:id', ({ params }) => {
          deletedId = String(params.id)
          return HttpResponse.json({ ok: true })
        }),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      const removeButtons = await screen.findAllByRole('button', {
        name: /remove passkey/i,
      })
      await user.click(removeButtons[0])

      await waitFor(() => {
        expect(deletedId).toBe('cred-1')
      })
      expect(confirmSpy).toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('does NOT call the API when the confirmation is cancelled', async () => {
      seedTwoCredentials()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      let called = false
      server.use(
        http.delete('/auth/credentials/:id', () => {
          called = true
          return HttpResponse.json({ ok: true })
        }),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      const removeButtons = await screen.findAllByRole('button', {
        name: /remove passkey/i,
      })
      await user.click(removeButtons[0])

      // give any in-flight network the chance to fire
      await new Promise((r) => setTimeout(r, 30))
      expect(called).toBe(false)
      confirmSpy.mockRestore()
    })

    it('shows the API error inline when delete is rejected', async () => {
      seedTwoCredentials()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      server.use(
        http.delete('/auth/credentials/:id', () =>
          HttpResponse.text('cannot delete last passkey', { status: 400 }),
        ),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      const removeButtons = await screen.findAllByRole('button', {
        name: /remove passkey/i,
      })
      await user.click(removeButtons[0])

      await waitFor(() => {
        expect(
          screen.getByText(/400: cannot delete last passkey/i),
        ).toBeInTheDocument()
      })
      confirmSpy.mockRestore()
    })
  })

  describe('logout', () => {
    it('navigates to /login on success', async () => {
      const { user } = await renderWithProviders({ initialPath: '/' })
      await user.click(screen.getByRole('button', { name: /settings/i }))
      await user.click(await screen.findByRole('button', { name: /log out/i }))
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /sign in with passkey/i }),
        ).toBeInTheDocument()
      })
    })
  })

  describe('add passkey', () => {
    it('runs ceremony and shows "Passkey added"', async () => {
      vi.mocked(startRegistration).mockResolvedValue(mockRegResponse)

      const { user } = await renderWithProviders({ initialPath: '/' })
      const addButton = await openSettings(user)
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText(/passkey added/i)).toBeInTheDocument()
      })
      expect(startRegistration).toHaveBeenCalledTimes(1)
    })

    it('shows "Cancelled" when user cancels the ceremony', async () => {
      const cancelErr = new Error('cancelled')
      cancelErr.name = 'NotAllowedError'
      vi.mocked(startRegistration).mockRejectedValue(cancelErr)

      const { user } = await renderWithProviders({ initialPath: '/' })
      const addButton = await openSettings(user)
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Cancelled')).toBeInTheDocument()
      })
    })

    it('surfaces verify-endpoint API error', async () => {
      vi.mocked(startRegistration).mockResolvedValue(mockRegResponse)
      server.use(
        http.post('/auth/credentials/add/verify', () =>
          HttpResponse.text('verify failed', { status: 400 }),
        ),
      )

      const { user } = await renderWithProviders({ initialPath: '/' })
      const addButton = await openSettings(user)
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText(/400: verify failed/i)).toBeInTheDocument()
      })
    })
  })
})
