import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { threadsQueryOptions } from '#/lib/api'
import { Button } from '#/components/ui/button'

interface ThreadListProps {
  onThreadOpen?: () => void
}

export function ThreadList({ onThreadOpen }: ThreadListProps) {
  const { data, isPending, isError } = useQuery(threadsQueryOptions())

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Threads</span>
        <Button size="sm" variant="outline" asChild>
          <Link to="/" onClick={() => onThreadOpen?.()}>
            <PlusIcon className="size-4" />
            New
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {isPending && (
          <p className="px-2 py-1 text-sm text-muted-foreground">Loading…</p>
        )}
        {isError && (
          <p className="px-2 py-1 text-sm text-destructive">
            Failed to load threads.
          </p>
        )}
        {data?.threads.length === 0 && (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            No threads yet.
          </p>
        )}
        <ul className="space-y-1">
          {data?.threads.map((t) => (
            <li key={t.id}>
              <Link
                to="/t/$threadId"
                params={{ threadId: t.id }}
                onClick={() => onThreadOpen?.()}
                className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent"
                activeProps={{ className: 'bg-accent font-medium' }}
              >
                {t.is_streaming && (
                  <span
                    aria-label="streaming"
                    className="size-2 shrink-0 rounded-full bg-primary animate-pulse"
                  />
                )}
                <span className="truncate">{t.title || 'Untitled'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
