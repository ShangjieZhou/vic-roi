// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BAR_WIDTH, Distribution, toBars } from './Distribution'
import { LangProvider } from './i18n'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Counts per 10-point band, from the server.
const hist = (counts: Record<number, number>) => Array.from({ length: 96 }, (_, i) => counts[i] ?? 0)
const draw = (props: Parameters<typeof Distribution>[0]) =>
  render(<LangProvider><Distribution {...props} /></LangProvider>)
const barButtons = () => screen.getAllByRole('button')

describe('toBars', () => {
  it('turns 96 bands of 10 points into 48 bars of 20 points', () => {
    expect(BAR_WIDTH).toBe(20)
    const bars = toBars(hist({}))
    expect(bars).toHaveLength(48)
    expect(bars[0]).toEqual({ from: 0, to: 19, count: 0 })
    expect(bars[31]).toEqual({ from: 620, to: 639, count: 0 })
  })

  it('adds two bands into one bar', () => {
    const bars = toBars(hist({ 62: 3, 63: 4, 64: 5 }))
    expect(bars[31].count).toBe(7) // 620 to 639
    expect(bars[32].count).toBe(5) // 640 to 659
  })

  it('ends the last bar at the top score, 950', () => {
    expect(toBars(hist({}))[47]).toEqual({ from: 940, to: 950, count: 0 })
  })

  it('keeps every candidate', () => {
    const counts = hist({ 10: 2, 33: 9, 95: 1 })
    expect(toBars(counts).reduce((a, b) => a + b.count, 0)).toBe(12)
  })
})

describe('Distribution', () => {
  const counts = hist({ 60: 4, 61: 6, 62: 10, 63: 15, 64: 8, 65: 3 })

  it('draws one bar for each 20 points, with room either side of the scores', () => {
    draw({ hist: counts, mine: 625, median: 628, n: 46 })
    // Scores fill the bars 600 to 659 (3 bars), plus an empty bar either side.
    expect(barButtons()).toHaveLength(5)
  })

  it('names each bar\'s score range and count on hover', () => {
    draw({ hist: counts, mine: 625, n: 46 })
    expect(screen.getByTitle('600 to 619 points: 10 candidates')).toBeTruthy()
    expect(screen.getByTitle('620 to 639 points: 25 candidates')).toBeTruthy()
    expect(screen.getByTitle('640 to 659 points: 11 candidates')).toBeTruthy()
  })

  it('uses the singular for one candidate and the plural for none', () => {
    draw({ hist: hist({ 62: 1 }), mine: 625, n: 31 })
    expect(screen.getByTitle('620 to 639 points: 1 candidate')).toBeTruthy()
    expect(screen.getAllByTitle(/: 0 candidates$/).length).toBeGreaterThan(0)
  })

  it('highlights the candidate\'s bar, shades the bars below it and leaves the rest grey', () => {
    draw({ hist: counts, mine: 625, n: 46 })
    expect(screen.getByTitle('620 to 639 points: 25 candidates').className).toContain('bg-accent')
    expect(screen.getByTitle('600 to 619 points: 10 candidates').className).toContain('bg-indigo-200')
    expect(screen.getByTitle('640 to 659 points: 11 candidates').className).toContain('bg-stone-300')
  })

  it('scales each bar to the biggest', () => {
    draw({ hist: counts, mine: 625, n: 46 })
    expect(screen.getByTitle('620 to 639 points: 25 candidates').getAttribute('style')).toContain('height: 100%')
    expect(screen.getByTitle('600 to 619 points: 10 candidates').getAttribute('style')).toContain('height: 40%')
  })

  it('shows the range and count of a tapped bar, and clears it when tapped again', () => {
    draw({ hist: counts, mine: 625, n: 46 })
    const bar = screen.getByTitle('640 to 659 points: 11 candidates')
    fireEvent.click(bar)
    expect(screen.getByText('640 to 659 points: 11 candidates', { selector: 'p' })).toBeTruthy()
    expect(bar.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(bar)
    expect(screen.queryByText('640 to 659 points: 11 candidates', { selector: 'p' })).toBeNull()
  })

  it('marks the median bar, and leaves the mark out when there is no median', () => {
    const { container, unmount } = draw({ hist: counts, mine: 625, median: 628, n: 46 })
    expect(container.querySelector('[data-median]')).not.toBeNull()
    unmount()
    expect(draw({ hist: counts, mine: 625, n: 46 }).container.querySelector('[data-median]')).toBeNull()
  })

  it('labels the candidate and the median', () => {
    const { container } = draw({ hist: counts, mine: 625, median: 628, n: 46 })
    expect(container.textContent).toContain('You 625')
    expect(container.textContent).toContain('Median 628')
  })

  it('labels the two ends of the score axis', () => {
    const { container } = draw({ hist: counts, mine: 625, n: 46 })
    const ends = container.querySelectorAll('.justify-between span')
    expect(ends[0].textContent).toBe('580')
    expect(ends[1].textContent).toBe('679')
  })

  it('keeps a candidate far above everyone on the chart', () => {
    draw({ hist: counts, mine: 940, n: 46 })
    expect(screen.getByTitle('940 to 950 points: 0 candidates').className).toContain('bg-accent')
  })

  it('draws nothing for an empty histogram', () => {
    expect(draw({ hist: hist({}), mine: 625, n: 46 }).container.innerHTML).toBe('')
  })

  it('is in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    draw({ hist: counts, mine: 625, n: 46 })
    expect(screen.getByTitle('620 至 639 分：25 位候选人')).toBeTruthy()
  })
})
