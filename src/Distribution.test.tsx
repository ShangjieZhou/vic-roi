// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BAR_WIDTH, Distribution, spreadLabels, toBars } from './Distribution'
import { LangProvider } from './i18n'

beforeEach(() => {
  // Layout does not exist in the test browser, so give the chart a width: 5 bars of 100 px each.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100, x: 0, y: 0, toJSON: () => ({}),
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

// Counts per 10-point band, from the server.
const hist = (counts: Record<number, number>) => Array.from({ length: 96 }, (_, i) => counts[i] ?? 0)
const draw = (props: Parameters<typeof Distribution>[0]) =>
  render(<LangProvider><Distribution {...props} /></LangProvider>)
const counts = hist({ 60: 4, 61: 6, 62: 10, 63: 15, 64: 8, 65: 3 })
// The chart shows 580 to 679: five bars, each 100 px wide in these tests.
const base = { hist: counts, mine: 625, median: 628, n: 46 }
const chart = () => screen.getByRole('group')
const tip = () => screen.queryByRole('tooltip')
const bar = (text: string) => screen.getByLabelText(text)

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
    expect(bars[31].count).toBe(7)
    expect(bars[32].count).toBe(5)
  })

  it('ends the last bar at the top score, 950', () => {
    expect(toBars(hist({}))[47]).toEqual({ from: 940, to: 950, count: 0 })
  })

  it('keeps every candidate', () => {
    expect(toBars(hist({ 10: 2, 33: 9, 95: 1 })).reduce((a, b) => a + b.count, 0)).toBe(12)
  })
})

describe('spreadLabels', () => {
  it('leaves well-spaced labels where they are', () => {
    expect(spreadLabels([20, 50, 80], 13)).toEqual([20, 50, 80])
  })

  it('pushes crowded labels apart around where they were, keeping their order', () => {
    const out = spreadLabels([48, 50, 52], 13)
    expect(out[1]).toBeCloseTo(50, 5)
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(13)
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(13)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
  })

  it('keeps every label inside the chart', () => {
    for (const out of [spreadLabels([0, 1, 2], 13), spreadLabels([98, 99, 100], 13)]) {
      for (const p of out) {
        expect(p).toBeGreaterThanOrEqual(6)
        expect(p).toBeLessThanOrEqual(94)
      }
    }
  })
})

describe('Distribution bars', () => {
  it('draws one bar for each 20 points, with an empty bar either side of the scores', () => {
    draw(base)
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('names each bar\'s score range and count for assistive technology', () => {
    draw(base)
    expect(bar('600 to 619 points: 10 candidates')).toBeTruthy()
    expect(bar('620 to 639 points: 25 candidates')).toBeTruthy()
    expect(bar('640 to 659 points: 11 candidates')).toBeTruthy()
  })

  it('uses the singular for one candidate and the plural for none', () => {
    draw({ ...base, hist: hist({ 62: 1 }) })
    expect(bar('620 to 639 points: 1 candidate')).toBeTruthy()
    expect(screen.getAllByLabelText(/: 0 candidates$/).length).toBeGreaterThan(0)
  })

  it('highlights the candidate\'s bar, shades the bars below it and leaves the rest grey', () => {
    draw(base)
    expect(bar('620 to 639 points: 25 candidates').className).toContain('bg-accent')
    expect(bar('600 to 619 points: 10 candidates').className).toContain('bg-indigo-200')
    expect(bar('640 to 659 points: 11 candidates').className).toContain('bg-stone-300')
  })

  it('scales each bar to the biggest', () => {
    draw(base)
    expect(bar('620 to 639 points: 25 candidates').getAttribute('style')).toContain('height: 100%')
    expect(bar('600 to 619 points: 10 candidates').getAttribute('style')).toContain('height: 40%')
  })

  it('marks the median bar, and leaves the mark out when there is no median', () => {
    const { container, unmount } = draw(base)
    expect(container.querySelector('[data-median]')).not.toBeNull()
    unmount()
    expect(draw({ ...base, median: undefined }).container.querySelector('[data-median]')).toBeNull()
  })

  it('labels the candidate and the median', () => {
    const { container } = draw(base)
    expect(container.textContent).toContain('You 625')
    expect(container.textContent).toContain('Median 628')
  })

  it('keeps a candidate far above everyone on the chart', () => {
    draw({ ...base, mine: 940 })
    expect(bar('940 to 950 points: 0 candidates').className).toContain('bg-accent')
  })

  it('draws nothing for an empty histogram', () => {
    expect(draw({ ...base, hist: hist({}) }).container.innerHTML).toBe('')
  })

  it('is in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    draw(base)
    expect(bar('620 至 639 分：25 位候选人')).toBeTruthy()
  })
})

describe('Distribution tooltip', () => {
  it('is hidden until the chart is touched', () => {
    draw(base)
    expect(tip()).toBeNull()
  })

  it('floats above the chart instead of being written underneath', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 250, pointerType: 'mouse' })
    expect(tip()).not.toBeNull()
    expect(tip()!.className).toContain('absolute')
    // The text is in the tooltip only, not in a caption below the bars.
    expect(screen.getAllByText(/620 to 639 points: 25 candidates/)).toHaveLength(1)
  })

  it('shows the bar under a mouse as it moves, and hides when it leaves', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 150, pointerType: 'mouse' })
    expect(tip()!.textContent).toContain('600 to 619 points: 10 candidates')
    fireEvent.pointerMove(chart(), { clientX: 350, pointerType: 'mouse' })
    expect(tip()!.textContent).toContain('640 to 659 points: 11 candidates')
    fireEvent.pointerLeave(chart(), { pointerType: 'mouse' })
    expect(tip()).toBeNull()
  })

  it('follows a finger pressed on a bar as it slides left and right across the neighbours', () => {
    draw(base)
    fireEvent.pointerDown(chart(), { clientX: 250, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('620 to 639 points: 25 candidates')
    fireEvent.pointerMove(chart(), { clientX: 350, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('640 to 659 points: 11 candidates')
    fireEvent.pointerMove(chart(), { clientX: 150, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('600 to 619 points: 10 candidates')
    fireEvent.pointerMove(chart(), { clientX: 50, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('580 to 599 points: 0 candidates')
  })

  it('stays on the last bar after the finger lifts, and no longer follows a finger that is not pressed', () => {
    draw(base)
    fireEvent.pointerDown(chart(), { clientX: 250, pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(chart(), { clientX: 250, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('620 to 639 points: 25 candidates')
    fireEvent.pointerMove(chart(), { clientX: 450, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('620 to 639 points: 25 candidates')
  })

  it('stays on the bar when a press ends, not just when it starts', () => {
    draw(base)
    fireEvent.pointerDown(chart(), { clientX: 150, pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerMove(chart(), { clientX: 450, pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(chart(), { clientX: 450, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('660 to 679 points: 0 candidates')
  })

  it('stays on the first and last bar when a slide goes past either end', () => {
    draw(base)
    fireEvent.pointerDown(chart(), { clientX: 250, pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerMove(chart(), { clientX: -80, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('580 to 599 points')
    fireEvent.pointerMove(chart(), { clientX: 900, pointerType: 'touch', pointerId: 1 })
    expect(tip()!.textContent).toContain('660 to 679 points')
  })

  it('closes when a tap lands outside the chart', () => {
    draw(base)
    fireEvent.pointerDown(chart(), { clientX: 250, pointerType: 'touch', pointerId: 1 })
    expect(tip()).not.toBeNull()
    fireEvent.pointerDown(document.body, { pointerType: 'touch', pointerId: 2 })
    expect(tip()).toBeNull()
  })

  it('highlights the active bar', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 350, pointerType: 'mouse' })
    expect(bar('640 to 659 points: 11 candidates').className).toContain('ring-2')
    expect(bar('600 to 619 points: 10 candidates').className).not.toContain('ring-2')
  })

  it('tells the candidate when the tooltip is on their own bar', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 250, pointerType: 'mouse' })
    expect(tip()!.textContent).toContain('You 625')
    fireEvent.pointerMove(chart(), { clientX: 350, pointerType: 'mouse' })
    expect(tip()!.textContent).not.toContain('You 625')
  })

  it('keeps the tooltip inside the chart at both ends', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 10, pointerType: 'mouse' })
    // The first bar is centred at 10%, but the tooltip is about 176 px wide on a 500 px chart.
    const left = parseFloat(tip()!.getAttribute('style')!.replace('left: ', ''))
    expect(left).toBeCloseTo(17.6, 1)
    fireEvent.pointerMove(chart(), { clientX: 490, pointerType: 'mouse' })
    expect(parseFloat(tip()!.getAttribute('style')!.replace('left: ', ''))).toBeCloseTo(82.4, 1)
    fireEvent.pointerMove(chart(), { clientX: 250, pointerType: 'mouse' })
    expect(parseFloat(tip()!.getAttribute('style')!.replace('left: ', ''))).toBeCloseTo(50, 1)
  })

  it('can be reached with the keyboard, and the arrow keys move to the next bar', () => {
    draw(base)
    const first = bar('580 to 599 points: 0 candidates')
    fireEvent.focus(first)
    expect(tip()!.textContent).toContain('580 to 599 points')
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(bar('600 to 619 points: 10 candidates'))
    expect(tip()!.textContent).toContain('600 to 619 points: 10 candidates')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)
  })

  it('closes when the focused bar loses focus', () => {
    draw(base)
    const first = bar('580 to 599 points: 0 candidates')
    fireEvent.focus(first)
    fireEvent.blur(first)
    expect(tip()).toBeNull()
  })

  it('describes the active bar by the tooltip', () => {
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 250, pointerType: 'mouse' })
    expect(bar('620 to 639 points: 25 candidates').getAttribute('aria-describedby')).toBe(tip()!.id)
  })

  it('is in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    draw(base)
    fireEvent.pointerMove(chart(), { clientX: 250, pointerType: 'mouse' })
    expect(tip()!.textContent).toContain('620 至 639 分：25 位候选人')
  })
})

describe('Distribution score axis', () => {
  const marks = { p25: 612, median: 628, p75: 645 }

  it('marks where 25%, 50% and 75% of candidates score below', () => {
    const { container } = draw({ ...base, marks })
    const labels = [...container.querySelectorAll('[data-mark]')]
    expect(labels.map((l) => l.getAttribute('data-mark'))).toEqual(['25', '50', '75'])
    expect(labels.map((l) => l.textContent)).toEqual(['25%612', '50%628', '75%645'])
  })

  it('puts each tick at its score along the axis', () => {
    const { container } = draw({ ...base, marks })
    // The chart runs from 580 over 100 points: 612 is 32% along, 628 is 48%, 645 is 65%.
    const ticks = [...container.querySelectorAll('[data-tick]')].map((t) => t.getAttribute('style'))
    expect(ticks).toEqual(['left: 32%;', 'left: 48%;', 'left: 65%;'])
  })

  it('moves crowded labels apart but keeps the ticks true', () => {
    const { container } = draw({ ...base, marks: { p25: 626, median: 628, p75: 630 } })
    const ticks = [...container.querySelectorAll('[data-tick]')].map((t) => t.getAttribute('style'))
    expect(ticks).toEqual(['left: 46%;', 'left: 48%;', 'left: 50%;'])
    const lefts = [...container.querySelectorAll('[data-mark]')].map((l) => parseFloat(l.getAttribute('style')!.replace('left: ', '')))
    expect(lefts[1] - lefts[0]).toBeGreaterThanOrEqual(13)
    expect(lefts[2] - lefts[1]).toBeGreaterThanOrEqual(13)
  })

  it('explains the marks', () => {
    draw({ ...base, marks })
    expect(screen.getByText('Marks show the scores that 25%, 50% and 75% of candidates fall below.')).toBeTruthy()
  })

  it('draws no marks when the server did not send them', () => {
    const { container } = draw(base)
    expect(container.querySelectorAll('[data-mark]')).toHaveLength(0)
    expect(screen.queryByText(/Marks show the scores/)).toBeNull()
  })

  it('is in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    draw({ ...base, marks })
    expect(screen.getByText('标记处为 25%、50% 和 75% 的候选人得分所低于的分数。')).toBeTruthy()
  })
})
