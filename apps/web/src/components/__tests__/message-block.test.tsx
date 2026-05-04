import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Block } from '#/hooks/use-chat-stream'
import { MessageBlocks } from '../message-block'

describe('MessageBlocks', () => {
  it('renders a single text block as markdown', () => {
    const blocks: Array<Block> = [{ type: 'text', text: 'hello world' }]
    render(<MessageBlocks blocks={blocks} />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders a single top-level tool_use as a chip', () => {
    const blocks: Array<Block> = [
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'Read',
        input: { file_path: '/tmp/x' },
      },
    ]
    render(<MessageBlocks blocks={blocks} />)
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('/tmp/x')).toBeInTheDocument()
  })

  it('nests tool_use children under the parent (parent_tool_use_id grouping)', () => {
    const blocks: Array<Block> = [
      {
        type: 'tool_use',
        id: 'agent_1',
        name: 'Agent',
        input: { subagent_type: 'researcher' },
      },
      {
        type: 'tool_use',
        id: 'ws_1',
        name: 'WebSearch',
        input: { query: 'foo' },
        parent_tool_use_id: 'agent_1',
      },
      {
        type: 'tool_use',
        id: 'ws_2',
        name: 'WebSearch',
        input: { query: 'bar' },
        parent_tool_use_id: 'agent_1',
      },
      { type: 'text', text: 'synthesis' },
    ]
    render(<MessageBlocks blocks={blocks} />)

    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getAllByText('WebSearch')).toHaveLength(2)
    expect(screen.getByText('"foo"')).toBeInTheDocument()
    expect(screen.getByText('"bar"')).toBeInTheDocument()
    expect(screen.getByText('synthesis')).toBeInTheDocument()
  })

  it('mixed text + tool_use ordering preserved', () => {
    const blocks: Array<Block> = [
      { type: 'text', text: 'before' },
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'Bash',
        input: { command: 'ls' },
      },
      { type: 'text', text: 'after' },
    ]
    const { container } = render(<MessageBlocks blocks={blocks} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('before')).toBeLessThan(text.indexOf('Bash'))
    expect(text.indexOf('Bash')).toBeLessThan(text.indexOf('after'))
  })

  it('empty blocks renders nothing', () => {
    const { container } = render(<MessageBlocks blocks={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
