import { useQueryClient } from '@tanstack/react-query'
import { useBlocker, useRouter } from '@tanstack/react-router'
import {
  StickToBottom,
  useStickToBottom,
  useStickToBottomContext,
} from 'use-stick-to-bottom'
import { ChevronDownIcon } from 'lucide-react'
import { messagesQueryOptions } from '#/lib/api'
import { useChatStream } from '#/hooks/use-chat-stream'
import { useIsMobile } from '#/hooks/use-mobile'
import { MessageList } from '#/components/message-list'
import { Composer } from '#/components/composer'
import { MessageBlocks } from '#/components/message-block'
import { Button } from '#/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'

interface ThreadViewProps {
  threadId: string | null
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const stickInstance = useStickToBottom({ initial: 'instant', resize: 'smooth' })
  const chat = useChatStream()
  const blocker = useBlocker({
    shouldBlockFn: () => chat.status === 'streaming',
    withResolver: true,
    enableBeforeUnload: () => chat.status === 'streaming',
  })

  async function handleSend(text: string) {
    void stickInstance.scrollToBottom()
    const result = await chat.send(text, threadId)
    if (!result) return
    queryClient.removeQueries({ queryKey: ['messages', result.thread_id] })
    await queryClient.fetchQuery(messagesQueryOptions(result.thread_id))
    chat.reset()
    queryClient.invalidateQueries({ queryKey: ['threads'] })
    queryClient.invalidateQueries({ queryKey: ['cost'] })
    if (threadId === null) {
      router.navigate({
        to: '/t/$threadId',
        params: { threadId: result.thread_id },
      })
    }
  }

  const lastBlock = chat.blocks[chat.blocks.length - 1]
  const showThinking =
    chat.status === 'streaming' &&
    (chat.blocks.length === 0 || lastBlock?.type === 'tool_use')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StickToBottom
        instance={stickInstance}
        className="relative min-h-0 flex-1"
      >
        <StickToBottom.Content className="flex flex-col">
          {threadId !== null && <MessageList threadId={threadId} />}
          {chat.pendingUserMessage !== null && (
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="max-w-[85%] self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {chat.pendingUserMessage}
                </pre>
              </div>
              <MessageBlocks blocks={chat.blocks} />
              {showThinking && (
                <p className="self-start text-sm italic text-muted-foreground">
                  Thinking…
                </p>
              )}
            </div>
          )}
        </StickToBottom.Content>
        <ScrollToBottomPill />
      </StickToBottom>
      {chat.errorMessage && (
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 text-sm"
          role="alert"
        >
          <p className="text-destructive">{chat.errorMessage}</p>
          {chat.pendingUserMessage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void chat.send(chat.pendingUserMessage!, threadId)
              }}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      <Composer
        disabled={chat.status === 'streaming'}
        onSend={handleSend}
      />
      <NavGuardPrompt
        open={blocker.status === 'blocked'}
        onCancel={() => blocker.reset?.()}
        onLeave={() => {
          chat.abort()
          blocker.proceed?.()
        }}
      />
    </div>
  )
}

interface NavGuardPromptProps {
  open: boolean
  onCancel: () => void
  onLeave: () => void
}

function NavGuardPrompt({ open, onCancel, onLeave }: NavGuardPromptProps) {
  const isMobile = useIsMobile()
  const onOpenChange = (next: boolean) => {
    if (!next) onCancel()
  }
  const title = 'Stop response?'
  const description = 'Leaving will cancel the response in progress.'

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="destructive" onClick={onLeave}>
              Leave
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Stay</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onLeave}>
            Leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ScrollToBottomPill() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => scrollToBottom()}
      aria-label="Scroll to bottom"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
    >
      <ChevronDownIcon className="size-3.5" />
      Scroll down
    </Button>
  )
}
