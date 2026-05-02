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
  const preview = formatInput(input)

  return (
    <div className="inline-flex max-w-[85%] items-center gap-2 self-start rounded-md border bg-muted/30 px-2.5 py-1 text-xs">
      <Icon className={`size-3.5 shrink-0 ${meta.color}`} aria-hidden />
      <span className={`font-medium ${meta.color}`}>{name}</span>
      {preview && (
        <span className="truncate text-muted-foreground">{preview}</span>
      )}
    </div>
  )
}

function formatInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return truncate(input)
  try {
    return truncate(JSON.stringify(input))
  } catch {
    return ''
  }
}

function truncate(s: string, max = 60): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
