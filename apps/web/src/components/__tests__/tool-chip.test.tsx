import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToolChip } from '../tool-chip'

describe('ToolChip', () => {
  describe('per-tool name + summary', () => {
    it('WebSearch shows quoted query', () => {
      render(<ToolChip name="WebSearch" input={{ query: 'serendipity' }} />)
      expect(screen.getByText('WebSearch')).toBeInTheDocument()
      expect(screen.getByText('"serendipity"')).toBeInTheDocument()
    })

    it('WebFetch shows the url', () => {
      render(
        <ToolChip name="WebFetch" input={{ url: 'https://example.com' }} />,
      )
      expect(screen.getByText('https://example.com')).toBeInTheDocument()
    })

    it('Read shows file_path', () => {
      render(<ToolChip name="Read" input={{ file_path: '/tmp/x.ts' }} />)
      expect(screen.getByText('/tmp/x.ts')).toBeInTheDocument()
    })

    it('Write shows file_path', () => {
      render(<ToolChip name="Write" input={{ file_path: '/tmp/y.ts' }} />)
      expect(screen.getByText('/tmp/y.ts')).toBeInTheDocument()
    })

    it('Edit shows file_path', () => {
      render(<ToolChip name="Edit" input={{ file_path: '/tmp/z.ts' }} />)
      expect(screen.getByText('/tmp/z.ts')).toBeInTheDocument()
    })

    it('Bash shows command', () => {
      render(<ToolChip name="Bash" input={{ command: 'ls -la' }} />)
      expect(screen.getByText('ls -la')).toBeInTheDocument()
    })

    it('Grep shows "pattern in path" when path is provided', () => {
      render(
        <ToolChip
          name="Grep"
          input={{ pattern: 'foo', path: 'src/' }}
        />,
      )
      expect(screen.getByText('foo in src/')).toBeInTheDocument()
    })

    it('Grep shows pattern only when no path', () => {
      render(<ToolChip name="Grep" input={{ pattern: 'foo' }} />)
      expect(screen.getByText('foo')).toBeInTheDocument()
    })

    it('Glob shows "pattern in path" when path is provided', () => {
      render(
        <ToolChip
          name="Glob"
          input={{ pattern: '**/*.ts', path: 'src/' }}
        />,
      )
      expect(screen.getByText('**/*.ts in src/')).toBeInTheDocument()
    })

    it('Glob shows pattern only when no path', () => {
      render(<ToolChip name="Glob" input={{ pattern: '**/*.ts' }} />)
      expect(screen.getByText('**/*.ts')).toBeInTheDocument()
    })

    it('Grep without a pattern renders no summary', () => {
      const { container } = render(<ToolChip name="Grep" input={{}} />)
      expect(screen.getByText('Grep')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })

    it('Glob without a pattern renders no summary', () => {
      const { container } = render(<ToolChip name="Glob" input={{}} />)
      expect(screen.getByText('Glob')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })

    it('Agent shows "subagent_type: \\"description\\"" when both', () => {
      render(
        <ToolChip
          name="Agent"
          input={{ subagent_type: 'researcher', description: 'find foo' }}
        />,
      )
      expect(screen.getByText('researcher: "find foo"')).toBeInTheDocument()
    })

    it('Agent shows subagent_type only', () => {
      render(
        <ToolChip name="Agent" input={{ subagent_type: 'researcher' }} />,
      )
      expect(screen.getByText('researcher')).toBeInTheDocument()
    })

    it('Agent shows description only', () => {
      render(<ToolChip name="Agent" input={{ description: 'find foo' }} />)
      expect(screen.getByText('"find foo"')).toBeInTheDocument()
    })
  })

  describe('fallback behavior', () => {
    it('unknown tool name renders without crashing and shows the name', () => {
      render(<ToolChip name="MysteryTool" input={{ x: 1 }} />)
      expect(screen.getByText('MysteryTool')).toBeInTheDocument()
      expect(screen.getByText('{"x":1}')).toBeInTheDocument()
    })

    it('null input renders no summary', () => {
      const { container } = render(<ToolChip name="Read" input={null} />)
      expect(screen.getByText('Read')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })

    it('non-object primitive input is stringified', () => {
      render(<ToolChip name="Mystery" input={42} />)
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('summary is truncated to 80 chars with ellipsis', () => {
      const long = 'x'.repeat(100)
      render(<ToolChip name="Bash" input={{ command: long }} />)
      const expected = 'x'.repeat(79) + '…'
      expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it('Agent with neither subagent_type nor description renders no summary', () => {
      const { container } = render(
        <ToolChip name="Agent" input={{ unrelated: 'x' }} />,
      )
      expect(screen.getByText('Agent')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })

    it('unknown tool with circular input falls back to empty summary', () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular
      const { container } = render(
        <ToolChip name="MysteryTool" input={circular} />,
      )
      expect(screen.getByText('MysteryTool')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })

    it('summarizer returning null renders no summary (WebSearch w/ no query)', () => {
      const { container } = render(<ToolChip name="WebSearch" input={{}} />)
      expect(screen.getByText('WebSearch')).toBeInTheDocument()
      expect(container.querySelectorAll('span').length).toBe(1)
    })
  })
})
