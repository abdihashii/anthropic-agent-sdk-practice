import { createFileRoute } from '@tanstack/react-router'
import { ThreadView } from '#/components/thread-view'

export const Route = createFileRoute('/_authed/t/$threadId')({
  component: Thread,
})

function Thread() {
  const { threadId } = Route.useParams()
  return <ThreadView threadId={threadId} />
}
