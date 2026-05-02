import {
  BotIcon,
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderSearchIcon,
  GlobeIcon,
  PencilLineIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'

const TOOL_META: Record<string, { icon: LucideIcon; color: string }> = {
  Read: { icon: FileTextIcon, color: 'text-sky-600 dark:text-sky-400' },
  Grep: { icon: SearchIcon, color: 'text-sky-600 dark:text-sky-400' },
  Glob: { icon: FolderSearchIcon, color: 'text-sky-600 dark:text-sky-400' },
  Write: { icon: FilePlusIcon, color: 'text-emerald-600 dark:text-emerald-400' },
  Edit: {
    icon: PencilLineIcon,
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  WebSearch: { icon: GlobeIcon, color: 'text-cyan-600 dark:text-cyan-400' },
  WebFetch: { icon: DownloadIcon, color: 'text-cyan-600 dark:text-cyan-400' },
  Bash: { icon: TerminalIcon, color: 'text-violet-600 dark:text-violet-400' },
  Agent: { icon: BotIcon, color: 'text-fuchsia-600 dark:text-fuchsia-400' },
}

const FALLBACK_META = { icon: WrenchIcon, color: 'text-muted-foreground' }

interface ToolChipProps {
  name: string
  input: unknown
}

export function ToolChip({ name, input }: ToolChipProps) {
  const meta = TOOL_META[name] ?? FALLBACK_META
  const Icon = meta.icon
  const summary = summarize(name, input)

  return (
    <div className="inline-flex max-w-[85%] flex-col gap-0.5 self-start rounded-md border bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 shrink-0 ${meta.color}`} aria-hidden />
        <span className={`text-xs font-medium ${meta.color}`}>{name}</span>
      </div>
      {summary && (
        <span className="break-words pl-[1.375rem] text-xs text-muted-foreground">
          {summary}
        </span>
      )}
    </div>
  )
}

const SUMMARIZERS: Record<
  string,
  (input: Record<string, unknown>) => string | null
> = {
  WebSearch: (i) => {
    const q = str(i.query)
    return q ? `"${q}"` : null
  },
  WebFetch: (i) => str(i.url),
  Read: (i) => str(i.file_path),
  Write: (i) => str(i.file_path),
  Edit: (i) => str(i.file_path),
  Bash: (i) => str(i.command),
  Grep: (i) => {
    const p = str(i.pattern)
    if (!p) return null
    const path = str(i.path)
    return path ? `${p} in ${path}` : p
  },
  Glob: (i) => {
    const p = str(i.pattern)
    if (!p) return null
    const path = str(i.path)
    return path ? `${p} in ${path}` : p
  },
  Agent: (i) => {
    const sub = str(i.subagent_type)
    const desc = str(i.description)
    if (sub && desc) return `${sub} — "${desc}"`
    if (sub) return sub
    if (desc) return `"${desc}"`
    return null
  },
}

function summarize(name: string, input: unknown): string {
  if (input == null) return ''
  if (typeof input !== 'object') return truncate(String(input), 80)
  const obj = input as Record<string, unknown>
  const summarizer = SUMMARIZERS[name]
  if (summarizer) {
    const result = summarizer(obj)
    return result ? truncate(result, 80) : ''
  }
  try {
    return truncate(JSON.stringify(obj), 80)
  } catch {
    return ''
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
