import { createFileRoute } from '@tanstack/react-router'
import { ThreadView } from '#/components/thread-view'

export const Route = createFileRoute('/_authed/')({
  component: Home,
})

function Home() {
  return <ThreadView threadId={null} />
}
