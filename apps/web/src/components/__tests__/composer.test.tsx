import { vi } from 'vitest'

vi.mock('#/hooks/use-media-query', () => ({
  useMediaQuery: vi.fn(() => false),
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMediaQuery } from '#/hooks/use-media-query'
import { Composer } from '../composer'

const noop = () => {}

describe('Composer', () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false)
  })

  describe('send button gating', () => {
    it('Send button is disabled when text is empty', () => {
      render(
        <Composer streaming={false} onSend={async () => {}} onStop={noop} />,
      )
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('Send button is disabled when text is whitespace only', async () => {
      const user = userEvent.setup()
      render(
        <Composer streaming={false} onSend={async () => {}} onStop={noop} />,
      )
      await user.type(screen.getByPlaceholderText('Message…'), '   ')
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('Send button enables when text is non-empty', async () => {
      const user = userEvent.setup()
      render(
        <Composer streaming={false} onSend={async () => {}} onStop={noop} />,
      )
      await user.type(screen.getByPlaceholderText('Message…'), 'hi')
      expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled()
    })
  })

  describe('streaming swap', () => {
    it('streaming=true hides Send and shows Stop; textarea is disabled', () => {
      render(
        <Composer streaming={true} onSend={async () => {}} onStop={noop} />,
      )
      expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Message…')).toBeDisabled()
    })

    it('clicking Stop calls onStop', async () => {
      const user = userEvent.setup()
      const onStop = vi.fn()
      render(
        <Composer streaming={true} onSend={async () => {}} onStop={onStop} />,
      )
      await user.click(screen.getByRole('button', { name: 'Stop' }))
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })

  describe('send flow', () => {
    it('clicking Send calls onSend with trimmed text and clears the textarea', async () => {
      const user = userEvent.setup()
      const onSend = vi.fn().mockResolvedValue(undefined)
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      const textarea = screen.getByPlaceholderText(
        'Message…',
      ) as HTMLTextAreaElement
      await user.type(textarea, '  hello  ')
      await user.click(screen.getByRole('button', { name: 'Send' }))
      expect(onSend).toHaveBeenCalledWith('hello')
      expect(textarea.value).toBe('')
    })

    it('restores text in the textarea when onSend rejects', async () => {
      const user = userEvent.setup()
      const onSend = vi.fn().mockRejectedValue(new Error('boom'))
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      const textarea = screen.getByPlaceholderText(
        'Message…',
      ) as HTMLTextAreaElement
      await user.type(textarea, 'hello')
      await user.click(screen.getByRole('button', { name: 'Send' }))
      expect(textarea.value).toBe('hello')
    })
  })

  describe('keyboard handling', () => {
    it('Enter on desktop submits', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true)
      const user = userEvent.setup()
      const onSend = vi.fn().mockResolvedValue(undefined)
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      await user.type(screen.getByPlaceholderText('Message…'), 'hello{Enter}')
      expect(onSend).toHaveBeenCalledWith('hello')
    })

    it('Shift+Enter on desktop inserts a newline (does NOT submit)', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true)
      const user = userEvent.setup()
      const onSend = vi.fn().mockResolvedValue(undefined)
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      const textarea = screen.getByPlaceholderText(
        'Message…',
      ) as HTMLTextAreaElement
      await user.type(textarea, 'a{Shift>}{Enter}{/Shift}b')
      expect(onSend).not.toHaveBeenCalled()
      expect(textarea.value).toBe('a\nb')
    })

    it('Enter on desktop with empty text does nothing (canSend guard)', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true)
      const user = userEvent.setup()
      const onSend = vi.fn().mockResolvedValue(undefined)
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      await user.click(screen.getByPlaceholderText('Message…'))
      await user.keyboard('{Enter}')
      expect(onSend).not.toHaveBeenCalled()
    })

    it('Enter on mobile inserts a newline (does NOT submit)', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false)
      const user = userEvent.setup()
      const onSend = vi.fn().mockResolvedValue(undefined)
      render(<Composer streaming={false} onSend={onSend} onStop={noop} />)
      const textarea = screen.getByPlaceholderText(
        'Message…',
      ) as HTMLTextAreaElement
      await user.type(textarea, 'a{Enter}b')
      expect(onSend).not.toHaveBeenCalled()
      expect(textarea.value).toBe('a\nb')
    })
  })
})
