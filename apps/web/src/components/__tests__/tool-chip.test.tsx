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

    it('summary is truncated to 80 chars with ellipsis', () => {
      const long = 'x'.repeat(100)
      render(<ToolChip name="Bash" input={{ command: long }} />)
      const expected = 'x'.repeat(79) + '…'
      expect(screen.getByText(expected)).toBeInTheDocument()
    })
  })
})
