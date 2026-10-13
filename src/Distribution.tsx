import { useState } from 'react'
import { useI18n } from './i18n'

// Each bar covers this many points of the total score.
export const BAR_WIDTH = 20
// The server counts candidates in bands of 10 points, so two bands make one bar.
const BANDS_PER_BAR = BAR_WIDTH / 10
const MAX_SCORE = 950

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

// Where a candidate sits among a group: one bar for each 20 points of score. Bars below the candidate are shaded,
// the candidate's own bar is highlighted, and the median is marked. Each bar shows its range and count on hover,
// and on tap for touch screens.
export function Distribution(props: { hist: number[]; mine: number; median?: number; n: number }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<number | null>(null)
  const bars = toBars(props.hist)
  const index = (score: number) => Math.min(Math.floor(score / BAR_WIDTH), bars.length - 1)

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

  return (
    <div className="mt-3">
      <div role="group" aria-label={t('dist.aria', { score: props.mine, n: props.n })} className="relative">
        <div className="flex h-20 items-end gap-px">
          {shown.map((b, k) => {
            const i = lo + k
            const tone = i === mineBar ? 'bg-accent' : i < mineBar ? 'bg-indigo-200' : 'bg-stone-300'
            return (
              <button
                key={b.from}
                type="button"
                title={label(b)}
                aria-label={label(b)}
                aria-pressed={picked === i}
                onClick={() => setPicked(picked === i ? null : i)}
                className={`min-w-0 flex-1 rounded-t-sm ${tone} ${picked === i ? 'ring-2 ring-stone-900/70' : ''}`}
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
      <div className="mt-1 flex justify-between text-[10px] text-stone-400 tabular-nums">
        <span>{shown[0].from}</span>
        <span>{shown[shown.length - 1].to}</span>
      </div>
      {picked !== null && (
        <p className="mt-1 text-xs font-medium text-stone-700" aria-live="polite">{label(bars[picked])}</p>
      )}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-stone-500">
        <span className="font-semibold text-accent">{t('dist.you', { score: props.mine })}</span>
        {props.median !== undefined && <span>{t('dist.median', { median: props.median })}</span>}
      </p>
    </div>
  )
}
