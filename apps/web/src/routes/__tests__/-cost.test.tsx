import { vi } from 'vitest'

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

import { HttpResponse, delay, http } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { server } from '#/test-utils/msw/server'
import { renderWithProviders } from '#/test-utils/render'
import type { CostSummary } from '#/lib/api'

const seededCost: CostSummary = {
  window_days: 7,
  total_turns: 12,
  total_cost_usd: 0.4521,
  cache_hit_ratio: 0.83,
  tool_success_rate: 0.92,
  latency_p50_ms: 1234,
  latency_p95_ms: 5678,
  subagent_count_total: 3,
  classifier_fallback_rate: 0.05,
  weekly_by_model: [
    {
      model_id: 'claude-sonnet-4-6',
      cost_usd: 0.3,
      input_tokens: 1500,
      output_tokens: 800,
      cache_read_tokens: 12000,
      cache_write_tokens: 2400,
    },
    {
      model_id: 'claude-haiku-4-5-20251001',
      cost_usd: 0.15,
      input_tokens: 700,
      output_tokens: 200,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    },
  ],
  tier_distribution: { sonnet: 8, haiku: 3, opus: 1 },
}

const emptyCost: CostSummary = {
  window_days: 7,
  total_turns: 0,
  total_cost_usd: 0,
  cache_hit_ratio: 0,
  tool_success_rate: null,
  latency_p50_ms: null,
  latency_p95_ms: null,
  subagent_count_total: 0,
  classifier_fallback_rate: 0,
  weekly_by_model: [],
  tier_distribution: {},
}

describe.each([
  { label: 'desktop', isMobile: false },
  { label: 'mobile', isMobile: true },
])('CostPage ($label)', ({ isMobile }) => {
  it('shows a loading state before data resolves', async () => {
    server.use(
      http.get('/api/cost', async () => {
        await delay(50)
        return HttpResponse.json(seededCost)
      }),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/total spend/i)).toBeInTheDocument()
    })
  })

  it('renders aggregate metrics from the seeded payload', async () => {
    server.use(
      http.get('/api/cost', () => HttpResponse.json(seededCost)),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(await screen.findByRole('heading', { name: /cost/i })).toBeInTheDocument()
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument()
    expect(screen.getByText('$0.4521')).toBeInTheDocument()
    expect(screen.getByText(/12 turns/i)).toBeInTheDocument()
    expect(screen.getByText('83.0%')).toBeInTheDocument()
    expect(screen.getByText('1234 ms')).toBeInTheDocument()
    expect(screen.getByText('5678 ms')).toBeInTheDocument()
    expect(screen.getByText('92.0%')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument()
    expect(screen.getByText('claude-haiku-4-5-20251001')).toBeInTheDocument()
  })

  it('shows the empty-state caption when total_turns is 0', async () => {
    server.use(http.get('/api/cost', () => HttpResponse.json(emptyCost)))
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(
      await screen.findByText(/no activity in the last 7 days/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/no spend yet/i)).toBeInTheDocument()
  })

  it('flags cache hit ratio below the 70% target', async () => {
    server.use(
      http.get('/api/cost', () =>
        HttpResponse.json({ ...seededCost, cache_hit_ratio: 0.5 }),
      ),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(await screen.findByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText(/below target/i)).toBeInTheDocument()
  })

  it('does not flag cache hit ratio at or above the 70% target', async () => {
    server.use(
      http.get('/api/cost', () =>
        HttpResponse.json({ ...seededCost, cache_hit_ratio: 0.83 }),
      ),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(await screen.findByText('83.0%')).toBeInTheDocument()
    expect(screen.queryByText(/below target/i)).not.toBeInTheDocument()
  })

  it('renders an em dash when latency values are null', async () => {
    server.use(
      http.get('/api/cost', () =>
        HttpResponse.json({
          ...seededCost,
          latency_p50_ms: null,
          latency_p95_ms: null,
        }),
      ),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    await screen.findByRole('heading', { name: /cost/i })
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('shows an error message when the request fails', async () => {
    server.use(
      http.get('/api/cost', () =>
        HttpResponse.text('boom', { status: 500 }),
      ),
    )
    await renderWithProviders({ initialPath: '/cost', isMobile })
    expect(await screen.findByText(/failed to load cost/i)).toBeInTheDocument()
  })
})

describe('navigation from SettingsPanel', () => {
  it('opens settings, clicks Cost, and lands on /cost', async () => {
    server.use(http.get('/api/cost', () => HttpResponse.json(seededCost)))
    const { user, router } = await renderWithProviders({ initialPath: '/' })
    await user.click(screen.getByRole('button', { name: /settings/i }))
    const costLink = await screen.findByRole('link', { name: /^cost$/i })
    await user.click(costLink)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cost')
    })
    expect(
      await screen.findByRole('heading', { name: /^cost$/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^theme$/i)).not.toBeInTheDocument()
  })
})
