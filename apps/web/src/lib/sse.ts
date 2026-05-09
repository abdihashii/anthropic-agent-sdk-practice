export type SseEvent =
  | { type: 'started'; data: { thread_id: string } }
  | { type: 'chunk'; data: { text: string } }
  | {
      type: 'tool_use'
      data: {
        id: string
        name: string
        input: unknown
        parent_tool_use_id?: string
      }
    }
  | { type: 'error'; data: { message: string } }
  | {
      type: 'done'
      data: { thread_id: string; session_id: string | null; cost_usd: number }
    }

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const parsed = parseBlock(block)
        if (parsed) yield parsed
        sep = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = ''
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!event || !data) return null

  try {
    const payload = JSON.parse(data)
    if (event === 'started') return { type: 'started', data: payload }
    if (event === 'chunk') return { type: 'chunk', data: payload }
    if (event === 'tool_use') return { type: 'tool_use', data: payload }
    if (event === 'done') return { type: 'done', data: payload }
    if (event === 'error') {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : Array.isArray(payload.errors) && payload.errors.length > 0
            ? `${payload.subtype ?? 'error'}: ${payload.errors.join('; ')}`
            : (payload.subtype ?? 'agent error')
      return { type: 'error', data: { message } }
    }
  } catch {
    return null
  }
  return null
}
