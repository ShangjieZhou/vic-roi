import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from './i18n'

// Each bar covers this many points of the total score.
export const BAR_WIDTH = 20
// The server counts candidates in bands of 10 points, so two bands make one bar.
const BANDS_PER_BAR = BAR_WIDTH / 10
const MAX_SCORE = 950
// About half the width of the widest tooltip, in pixels.
const TOOLTIP_HALF_WIDTH = 88

export interface Bar {
  from: number
  to: number
  count: number
}

// Joins the 10-point bands into 20-point bars. The last bar ends at the top score, 950.
export function toBars(hist: number[]): Bar[] {
  const bars: Bar[] = []
  for (let i = 0; i < hist.length; i += BANDS_PER_BAR) {
    const from = (i / BANDS_PER_BAR) * BAR_WIDTH
    const count = hist.slice(i, i + BANDS_PER_BAR).reduce((a, b) => a + b, 0)
    bars.push({ from, to: Math.min(from + BAR_WIDTH - 1, MAX_SCORE), count })
  }
  return bars
}

// Spreads labels along an axis so neighbours keep at least `gap` percent apart and none leaves the chart. The marks
// keep their true place, only their labels move.
export function spreadLabels(positions: number[], gap: number, min = 6, max = 94): number[] {
  const clamp = (p: number) => Math.min(max, Math.max(min, p))
  const out = positions.map(clamp)
  // Neighbours that sit too close push each other apart by half the shortfall each, until none are crowded.
  for (let round = 0; round < 60; round++) {
    let moved = false
    for (let i = 1; i < out.length; i++) {
      // A hair over the gap, so the rounding of repeated halving never leaves a pair just short of it.
      const short = gap + 1e-6 - (out[i] - out[i - 1])
      if (short > 1e-9) {
        out[i - 1] -= short / 2
        out[i] += short / 2
        moved = true
      }
    }
    for (let i = 0; i < out.length; i++) out[i] = clamp(out[i])
    if (!moved) break
  }
  return out
}

// The scores 25%, 50% and 75% of candidates fall below.
export interface Marks {
  p25: number
  median: number
  p75: number
}

// Where a candidate sits among a group: one bar for each 20 points of score. Bars below the candidate are shaded,
// the candidate's own bar is highlighted, and the median is marked. Hovering a bar, or pressing it and sliding
// along the chart, shows its score range and count in a tooltip. The score axis marks where 25%, 50% and 75% of
// candidates score below.
export function Distribution(props: { hist: number[]; mine: number; median?: number; marks?: Marks; n: number }) {
  const { t } = useI18n()
  const tooltipId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const [active, setActive] = useState<number | null>(null)
  const bars = toBars(props.hist)
  const index = (score: number) => Math.min(Math.floor(score / BAR_WIDTH), bars.length - 1)

  // A tap outside the chart closes the tooltip.
  useEffect(() => {
    if (active === null) return
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [active])

  const first = bars.findIndex((b) => b.count > 0)
  if (first < 0) return null
  const last = bars.length - 1 - [...bars].reverse().findIndex((b) => b.count > 0)
  const mineBar = index(props.mine)
  const medianBar = props.median === undefined ? null : index(props.median)
  // The visible bars: everyone's scores and this candidate's, with a bar of room either side.
  const lo = Math.max(0, Math.min(first, mineBar) - 1)
  const hi = Math.min(bars.length - 1, Math.max(last, mineBar) + 1)
  const shown = bars.slice(lo, hi + 1)
  const peak = Math.max(1, ...shown.map((b) => b.count))
  const label = (b: Bar) => t('dist.bar', { from: b.from, to: b.to, count: b.count })
  const percentOf = (score: number) => Math.min(100, Math.max(0, ((score - shown[0].from) / (shown.length * BAR_WIDTH)) * 100))

  // The bar under a pointer, found from its place along the chart so a slide can pass over neighbouring bars.
  const barAt = (clientX: number): number | null => {
    const rect = wrap.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return null
    const k = Math.floor(((clientX - rect.left) / rect.width) * shown.length)
    return lo + Math.min(shown.length - 1, Math.max(0, k))
  }

  // The tooltip is centred on its bar, but kept inside the chart at both ends.
  const tooltipLeft = (k: number) => {
    const width = wrap.current?.getBoundingClientRect().width || 320
    const half = Math.min(50, (TOOLTIP_HALF_WIDTH / width) * 100)
    return Math.min(100 - half, Math.max(half, ((k + 0.5) / shown.length) * 100))
  }

  const marks = props.marks
    ? ([
        { p: 25, score: props.marks.p25 },
        { p: 50, score: props.marks.median },
        { p: 75, score: props.marks.p75 },
      ] as const)
    : null
  const markAt = marks ? marks.map((m) => percentOf(m.score)) : []
  const labelAt = marks ? spreadLabels(markAt, 13) : []

  return (
    <div className="mt-3">
      <div
        ref={wrap}
        role="group"
        aria-label={t('dist.aria', { score: props.mine, n: props.n })}
        className="relative touch-pan-y select-none pt-9"
        onPointerDown={(e) => {
          pressed.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setActive(barAt(e.clientX))
        }}
        onPointerMove={(e) => {
          // A mouse shows the tooltip as it passes over. A finger or pen shows it while pressed.
          if (pressed.current || e.pointerType === 'mouse') setActive(barAt(e.clientX))
        }}
        onPointerUp={() => {
          pressed.current = false
        }}
        onPointerCancel={() => {
          pressed.current = false
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !pressed.current) setActive(null)
        }}
      >
        {active !== null && bars[active] && (
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg"
            style={{ left: `${tooltipLeft(active - lo)}%` }}
          >
            {label(bars[active])}
            {active === mineBar && <span className="ml-1.5 text-indigo-200">{t('dist.you', { score: props.mine })}</span>}
          </div>
        )}
        <div className="relative">
          <div className="flex h-20 items-end gap-px">
            {shown.map((b, k) => {
              const i = lo + k
              const tone = i === mineBar ? 'bg-accent' : i < mineBar ? 'bg-indigo-200' : 'bg-stone-300'
              return (
                <button
                  key={b.from}
                  type="button"
                  aria-label={label(b)}
                  aria-describedby={active === i ? tooltipId : undefined}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  onKeyDown={(e) => {
                    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
                    if (!step) return
                    e.preventDefault()
                    const next = e.currentTarget.parentElement?.children[k + step] as HTMLElement | undefined
                    if (!next) return
                    next.focus()
                    setActive(i + step)
                  }}
                  className={`min-w-0 flex-1 rounded-t-sm ${tone} ${active === i ? 'ring-2 ring-stone-900/70' : ''}`}
                  style={{ height: `${Math.max(b.count === 0 ? 3 : 6, (b.count / peak) * 100)}%` }}
                />
              )
            })}
          </div>
          {medianBar !== null && medianBar >= lo && medianBar <= hi && (
            <div
              data-median
              className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-stone-900"
              style={{ left: `${((medianBar - lo + 0.5) / shown.length) * 100}%` }}
            />
          )}
        </div>
      </div>
      {marks && (
        <div className="relative mt-0.5 h-9 border-t border-stone-300 text-center text-[10px] leading-tight tabular-nums">
          {marks.map((m, k) => (
            <div key={m.p}>
              <span data-tick className="absolute top-0 h-1.5 w-px bg-stone-500" style={{ left: `${markAt[k]}%` }} />
              <span
                data-mark={m.p}
                className="absolute top-2 -translate-x-1/2"
                style={{ left: `${labelAt[k]}%` }}
              >
                <span className="block text-stone-400">{m.p}%</span>
                <span className="block font-semibold text-stone-700">{m.score}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-stone-500">
        <span className="font-semibold text-accent">{t('dist.you', { score: props.mine })}</span>
        {props.median !== undefined && <span>{t('dist.median', { median: props.median })}</span>}
      </p>
      {marks && <p className="mt-0.5 text-[11px] leading-snug text-stone-400">{t('dist.marks')}</p>}
    </div>
  )
}
