import { useId } from 'react'
import { useI18n } from './i18n'

// Pools smaller than this are drawn as one dot per candidate. A smooth curve through a few people would show a
// pattern that is not there.
export const SMOOTH_MIN = 30
const BAND = 10

// Spreads each band's count over its neighbours with a bell-shaped weight, so the histogram becomes a smooth curve.
export function smooth(hist: number[], sigma = 2): number[] {
  const radius = Math.ceil(sigma * 3)
  return hist.map((_, i) => {
    let sum = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(hist.length - 1, i + radius); j++) {
      sum += hist[j] * Math.exp(-0.5 * ((i - j) / sigma) ** 2)
    }
    return sum
  })
}

const W = 300
const H = 76
const PAD = 6
const TOP = 6
const BASE = H - 16

// Where a candidate sits among a group. A smooth curve for a big group, one dot per candidate for a small one.
export function Distribution(props: { hist: number[]; mine: number; median?: number; n: number }) {
  const { t } = useI18n()
  const clip = useId().replace(/:/g, '')
  const { hist, mine, median, n } = props

  const first = hist.findIndex((c) => c > 0)
  if (first < 0) return null
  const last = hist.length - 1 - [...hist].reverse().findIndex((c) => c > 0)
  // The visible range of bands: everyone's scores and this candidate's, with some room either side.
  const mineBand = Math.min(Math.floor(mine / BAND), hist.length - 1)
  const lo = Math.max(0, Math.min(first, mineBand) - 3)
  const hi = Math.min(hist.length - 1, Math.max(last, mineBand) + 3)
  const span = (hi + 1 - lo) * BAND
  const x = (score: number) => PAD + ((score - lo * BAND) / span) * (W - 2 * PAD)
  const bandPx = ((W - 2 * PAD) / (hi + 1 - lo))
  const centre = (band: number) => x(band * BAND + BAND / 2)

  const dots = n < SMOOTH_MIN
  let shape: React.ReactNode
  if (dots) {
    const stack = Math.max(...hist.slice(lo, hi + 1))
    const r = Math.max(1.5, Math.min(4, bandPx * 0.55, (BASE - TOP) / (2 * stack)))
    shape = hist.slice(lo, hi + 1).flatMap((count, k) => {
      const band = lo + k
      return Array.from({ length: count }, (_, d) => (
        <circle
          key={`${band}-${d}`}
          cx={centre(band)}
          cy={BASE - r - d * 2 * r}
          r={r}
          // The candidate is the top dot of their own band.
          className={band === mineBand && d === count - 1 ? 'fill-accent' : 'fill-stone-400'}
        />
      ))
    })
  } else {
    const dens = smooth(hist)
    const peak = Math.max(...dens.slice(lo, hi + 1))
    const y = (d: number) => BASE - (d / peak) * (BASE - TOP)
    const points = dens.slice(lo, hi + 1).map((d, k) => `${centre(lo + k).toFixed(1)},${y(d).toFixed(1)}`)
    const path = `M${x(lo * BAND)},${BASE} L${points.join(' L')} L${x((hi + 1) * BAND)},${BASE} Z`
    shape = (
      <>
        <clipPath id={clip}>
          <rect x="0" y="0" width={x(mine)} height={H} />
        </clipPath>
        <path d={path} className="fill-stone-200" />
        {/* The part of the group below this candidate. */}
        <path d={path} clipPath={`url(#${clip})`} className="fill-indigo-200" />
      </>
    )
  }

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={t('dist.aria', { score: mine, n, median: median ?? '' })}
      >
        {shape}
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} className="stroke-stone-300" strokeWidth="1" />
        {median !== undefined && (
          <line x1={x(median)} x2={x(median)} y1={TOP} y2={BASE} className="stroke-stone-900" strokeWidth="1" strokeDasharray="3 2" />
        )}
        <line x1={x(mine)} x2={x(mine)} y1={TOP - 2} y2={BASE} className="stroke-accent" strokeWidth="2" />
        <circle cx={x(mine)} cy={TOP - 2} r="3.5" className="fill-accent" />
        <text x={PAD} y={H - 3} className="fill-stone-400" fontSize="9">{lo * BAND}</text>
        <text x={W - PAD} y={H - 3} textAnchor="end" className="fill-stone-400" fontSize="9">{(hi + 1) * BAND}</text>
      </svg>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-stone-500">
        <span className="font-semibold text-accent">{t('dist.you', { score: mine })}</span>
        {median !== undefined && <span>{t('dist.median', { median })}</span>}
        {dots && <span className="text-stone-400">{t('dist.dots')}</span>}
      </p>
    </div>
  )
}
