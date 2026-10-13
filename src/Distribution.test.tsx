// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Distribution, SMOOTH_MIN, smooth } from './Distribution'
import { LangProvider } from './i18n'

afterEach(cleanup)

const hist = (counts: Record<number, number>) => Array.from({ length: 96 }, (_, i) => counts[i] ?? 0)
const draw = (props: Parameters<typeof Distribution>[0]) =>
  render(<LangProvider><Distribution {...props} /></LangProvider>)

describe('smooth', () => {
  it('turns a single spike into a bell centred on it', () => {
    const out = smooth(hist({ 50: 10 }))
    expect(out[50]).toBe(Math.max(...out))
    expect(out[48]).toBeCloseTo(out[52], 10)
    expect(out[44]).toBeLessThan(out[48])
  })

  it('ranks a denser area above a sparser one', () => {
    const out = smooth(hist({ 40: 10, 41: 10, 42: 10, 70: 2 }))
    expect(out[41]).toBeGreaterThan(out[70] * 5)
  })

  it('gives zeros for an empty histogram', () => {
    expect(smooth(hist({})).every((v) => v === 0)).toBe(true)
  })
})

describe('Distribution', () => {
  it('draws one dot per candidate for a small group, with the candidate highlighted', () => {
    const { container } = draw({ hist: hist({ 50: 2, 55: 3, 60: 1 }), mine: 555, median: 550, n: 6 })
    const dots = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('r') !== '3.5')
    expect(dots).toHaveLength(6)
    expect(dots.filter((c) => c.getAttribute('class')?.includes('fill-accent'))).toHaveLength(1)
    expect(container.querySelector('path')).toBeNull()
    expect(container.textContent).toContain('Each dot is one candidate')
  })

  it('draws a smooth curve for a group of 30 or more', () => {
    const { container } = draw({ hist: hist({ 50: 20, 55: 30, 60: 10 }), mine: 555, median: 550, n: SMOOTH_MIN + 30 })
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('Each dot')
  })

  it('switches from dots to a curve at 30 candidates', () => {
    const counts = hist({ 50: 15, 55: 15 })
    expect(draw({ hist: counts, mine: 520, n: SMOOTH_MIN - 1 }).container.querySelector('path')).toBeNull()
    expect(draw({ hist: counts, mine: 520, n: SMOOTH_MIN }).container.querySelector('path')).not.toBeNull()
  })

  it('labels the candidate and the median', () => {
    const { container } = draw({ hist: hist({ 50: 40 }), mine: 505, median: 500, n: 40 })
    expect(container.textContent).toContain('You 505')
    expect(container.textContent).toContain('Median 500')
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toContain('505')
  })

  it('leaves out the median when there is none', () => {
    expect(draw({ hist: hist({ 50: 40 }), mine: 505, n: 40 }).container.textContent).not.toContain('Median')
  })

  it('draws nothing for an empty histogram', () => {
    expect(draw({ hist: hist({}), mine: 505, n: 40 }).container.innerHTML).toBe('')
  })

  it('keeps a candidate outside everyone else on the chart', () => {
    const { container } = draw({ hist: hist({ 50: 40 }), mine: 900, n: 40 })
    const marker = container.querySelector('line.stroke-accent')!
    const x = Number(marker.getAttribute('x1'))
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThanOrEqual(300)
  })
})
