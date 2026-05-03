import { HttpResponse } from 'msw'

interface DoneData {
  thread_id: string
  session_id: string
  cost_usd: number
}

interface ToolUseData {
  id: string
  name: string
  input: unknown
  parent_tool_use_id?: string
}

export interface MockChatStream {
  chunk: (text: string) => void
  toolUse: (data: ToolUseData) => void
  error: (data: { message: string } | { subtype?: string; errors?: Array<string> }) => void
  done: (data: DoneData) => void
  close: () => void
  response: Response
}

export function mockChatStream(): MockChatStream {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      closed = true
    },
  })

  const enqueue = (event: string, data: unknown) => {
    if (closed || !controller) return
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }

  const finish = () => {
    if (closed || !controller) return
    closed = true
    controller.close()
  }

  return {
    chunk: (text) => enqueue('chunk', { text }),
    toolUse: (data) => enqueue('tool_use', data),
    error: (data) => {
      enqueue('error', data)
      finish()
    },
    done: (data) => {
      enqueue('done', data)
      finish()
    },
    close: finish,
    response: new HttpResponse(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    }),
  }
}
