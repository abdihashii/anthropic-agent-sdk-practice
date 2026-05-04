import { describe, expect, it } from 'vitest'
import { parseSseStream, type SseEvent } from '../sse'

function synthStream(chunks: Array<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i++]))
    },
  })
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal = new AbortController().signal,
): Promise<Array<SseEvent>> {
  const events: Array<SseEvent> = []
  for await (const event of parseSseStream(stream, signal)) {
    events.push(event)
  }
  return events
}

describe('parseSseStream', () => {
  it('parses a single chunk frame', async () => {
    const stream = synthStream([
      'event: chunk\ndata: {"text":"hello"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([{ type: 'chunk', data: { text: 'hello' } }])
  })

  it('parses two complete frames in one chunk', async () => {
    const stream = synthStream([
      'event: chunk\ndata: {"text":"a"}\n\nevent: chunk\ndata: {"text":"b"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([
      { type: 'chunk', data: { text: 'a' } },
      { type: 'chunk', data: { text: 'b' } },
    ])
  })

  it('parses chunks split mid-frame across reads (buffer rejoin)', async () => {
    const stream = synthStream([
      'event: chunk\ndata: {"text":"hel',
      'lo"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([{ type: 'chunk', data: { text: 'hello' } }])
  })

  it('parses tool_use frames including parent_tool_use_id', async () => {
    const stream = synthStream([
      'event: tool_use\ndata: {"id":"tu_1","name":"WebSearch","input":{"query":"foo"},"parent_tool_use_id":"tu_0"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([
      {
        type: 'tool_use',
        data: {
          id: 'tu_1',
          name: 'WebSearch',
          input: { query: 'foo' },
          parent_tool_use_id: 'tu_0',
        },
      },
    ])
  })

  it('emits done event and ends the iteration', async () => {
    const stream = synthStream([
      'event: chunk\ndata: {"text":"x"}\n\nevent: done\ndata: {"thread_id":"t","session_id":"s","cost_usd":0.01}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({
      type: 'done',
      data: { thread_id: 't', session_id: 's', cost_usd: 0.01 },
    })
  })

  it('normalizes error frame {message} payload', async () => {
    const stream = synthStream([
      'event: error\ndata: {"message":"boom"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([{ type: 'error', data: { message: 'boom' } }])
  })

  it('normalizes error frame {subtype, errors[]} payload', async () => {
    const stream = synthStream([
      'event: error\ndata: {"subtype":"rate_limit","errors":["429","try later"]}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([
      { type: 'error', data: { message: 'rate_limit: 429; try later' } },
    ])
  })

  it('normalizes error frame {subtype} only payload', async () => {
    const stream = synthStream([
      'event: error\ndata: {"subtype":"rate_limit"}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([
      { type: 'error', data: { message: 'rate_limit' } },
    ])
  })

  it('normalizes error frame with errors[] but no subtype', async () => {
    const stream = synthStream([
      'event: error\ndata: {"errors":["bad","stuff"]}\n\n',
    ])
    const events = await collect(stream)
    expect(events).toEqual([
      { type: 'error', data: { message: 'error: bad; stuff' } },
    ])
  })

  it('throws AbortError when signal is already aborted', async () => {
    const stream = synthStream(['event: chunk\ndata: {"text":"x"}\n\n'])
    const ac = new AbortController()
    ac.abort()
    const gen = parseSseStream(stream, ac.signal)
    await expect(gen.next()).rejects.toThrow(/aborted/i)
  })

  it('drops trailing partial when stream ends without final \\n\\n', async () => {
    const stream = synthStream([
      'event: chunk\ndata: {"text":"a"}\n\nevent: chunk\ndata: {"text":"part',
    ])
    const events = await collect(stream)
    expect(events).toEqual([{ type: 'chunk', data: { text: 'a' } }])
  })
})
