import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { costQueryOptions, type CostSummary } from '#/lib/api'
import { useIsMobile } from '#/hooks/use-mobile'

export const Route = createFileRoute('/_authed/cost')({
  component: CostPage,
})

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function formatUsd(n: number): string {
  return usdFormatter.format(n)
}

function formatPercent(n: number, fractionDigits = 1): string {
  return `${(n * 100).toFixed(fractionDigits)}%`
}

function formatTokens(n: number): string {
  return compactNumberFormatter.format(n)
}

function formatMs(n: number | null): string {
  return n === null ? '—' : `${n} ms`
}

const CACHE_HIT_TARGET = 0.7

export function CostPage() {
  const { data, isPending, isError } = useQuery(costQueryOptions())
  const isMobile = useIsMobile()

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  }
  if (isError || !data) {
    return (
      <p className="p-4 text-sm text-destructive">Failed to load cost.</p>
    )
  }

  const empty = data.total_turns === 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl">
        <header className="px-4 pt-4">
          <h1 className="text-lg font-semibold">Cost</h1>
          <p className="text-sm text-muted-foreground">
            Last {data.window_days} days
          </p>
        </header>
        {empty && (
          <p className="px-4 pt-2 text-sm text-muted-foreground">
            No activity in the last {data.window_days} days.
          </p>
        )}
        <div
          className={
            isMobile
              ? 'flex flex-col gap-3 p-4'
              : 'grid grid-cols-2 gap-3 p-4'
          }
        >
          <Card label="Total spend">
            <Stat
              value={formatUsd(data.total_cost_usd)}
              caption={`${data.total_turns} turn${data.total_turns === 1 ? '' : 's'}`}
            />
          </Card>
          <Card label="Cache hit ratio">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatPercent(data.cache_hit_ratio)}
              </span>
              {data.cache_hit_ratio < CACHE_HIT_TARGET && !empty && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  below target ({formatPercent(CACHE_HIT_TARGET, 0)})
                </span>
              )}
            </div>
          </Card>
          <Card label="Latency">
            <dl className="flex gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">p50</dt>
                <dd className="font-medium tabular-nums">
                  {formatMs(data.latency_p50_ms)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">p95</dt>
                <dd className="font-medium tabular-nums">
                  {formatMs(data.latency_p95_ms)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card label="Tool success rate">
            <Stat
              value={
                data.tool_success_rate === null
                  ? '—'
                  : formatPercent(data.tool_success_rate)
              }
              caption="of tool calls"
            />
          </Card>
          <Card label="Subagent invocations">
            <Stat
              value={String(data.subagent_count_total)}
              caption="across all turns"
            />
          </Card>
          <Card label="Tier mix">
            <TierMix
              distribution={data.tier_distribution}
              totalTurns={data.total_turns}
            />
          </Card>
        </div>
        <div className="px-4 pb-4">
          <Card label="Weekly spend by model">
            <WeeklyByModel
              entries={data.weekly_by_model}
              isMobile={isMobile}
            />
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            Classifier fallback rate:{' '}
            {formatPercent(data.classifier_fallback_rate)}
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Stat({ value, caption }: { value: string; caption?: string }) {
  return (
    <>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {caption && (
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      )}
    </>
  )
}

function TierMix({
  distribution,
  totalTurns,
}: {
  distribution: Record<string, number>
  totalTurns: number
}) {
  const entries = Object.entries(distribution)
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>
  }
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {entries.map(([tier, n]) => (
        <div key={tier} className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground capitalize">{tier}</dt>
          <dd className="font-medium tabular-nums">
            {n}
            {totalTurns > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatPercent(n / totalTurns, 0)})
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function WeeklyByModel({
  entries,
  isMobile,
}: {
  entries: Array<CostSummary['weekly_by_model'][number]>
  isMobile: boolean
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No spend yet.</p>
  }
  if (isMobile) {
    return (
      <ul className="space-y-3">
        {entries.map((e) => (
          <li
            key={e.model_id}
            className="flex flex-col gap-1 border-b pb-2 last:border-0 last:pb-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {e.model_id}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatUsd(e.cost_usd)}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>in {formatTokens(e.input_tokens)}</span>
              <span>out {formatTokens(e.output_tokens)}</span>
              <span>cache r {formatTokens(e.cache_read_tokens)}</span>
              <span>cache w {formatTokens(e.cache_write_tokens)}</span>
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 text-left font-medium">Model</th>
            <th className="py-2 text-right font-medium">Cost</th>
            <th className="py-2 text-right font-medium">Input</th>
            <th className="py-2 text-right font-medium">Output</th>
            <th className="py-2 text-right font-medium">Cache R</th>
            <th className="py-2 text-right font-medium">Cache W</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.model_id} className="border-b last:border-0">
              <td className="py-2 pr-4">{e.model_id}</td>
              <td className="py-2 text-right font-medium tabular-nums">
                {formatUsd(e.cost_usd)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatTokens(e.input_tokens)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatTokens(e.output_tokens)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatTokens(e.cache_read_tokens)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatTokens(e.cache_write_tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
