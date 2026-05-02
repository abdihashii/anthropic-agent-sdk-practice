import { useState, type KeyboardEvent } from 'react'
import { SendIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useMediaQuery } from '#/hooks/use-media-query'

interface ComposerProps {
  disabled: boolean
  onSend: (text: string) => Promise<void>
}

export function Composer({ disabled, onSend }: ComposerProps) {
  const [text, setText] = useState('')
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const trimmed = text.trim()
  const canSend = !disabled && trimmed !== ''

  async function send() {
    if (!canSend) return
    const sent = trimmed
    setText('')
    try {
      await onSend(sent)
    } catch {
      setText(sent)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="shrink-0 border-t bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="relative rounded-lg border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Message…"
          className="block max-h-40 w-full resize-none bg-transparent px-3 py-2 pr-11 text-base focus:outline-none disabled:opacity-50"
        />
        <Button
          type="button"
          size="icon-sm"
          aria-label="Send"
          onClick={send}
          disabled={!canSend}
          className="absolute bottom-1.5 right-1.5"
        >
          <SendIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
