// Types and pure helpers for the submit-and-compare insights.
// Shared by the browser and the edge function. Aggregates come from Postgres (pool_stats);
// the assessment and the improvement levers are computed from those numbers.

import { calculateVpt, type CategoryKey, type Location, type VptInput } from './scoring.ts'

export const MIN_OVERALL = 10
export const MIN_OCCUPATION = 5

export interface PoolStats {
  n: number
  percentile?: number
  median?: number
  p25?: number
  p75?: number
  histogram?: { from: number; count: number }[]
  categoryAvg?: Partial<Record<CategoryKey, number>>
  // Share of candidates (0 to 100) scoring below this one in each section, ties counted as half.
  categoryPercentile?: Partial<Record<CategoryKey, number>>
}

export interface Insights {
  total: number
  location: Location
  overall: PoolStats
  occupation: (PoolStats & { name: string }) | null
}

export function isRanked(stats: PoolStats | null | undefined): stats is PoolStats & { percentile: number; median: number } {
  return !!stats && stats.percentile !== undefined && stats.median !== undefined
}

// Returns null when no occupation was given and 'invalid' when the text is not acceptable.
export function normalizeOccupation(raw: unknown): { name: string; key: string } | null | 'invalid' {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return 'invalid'
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name === '') return null
  if (name.length < 2 || name.length > 80) return 'invalid'
  if (!/^[\p{L}\p{N} .,'&()/-]+$/u.test(name)) return 'invalid'
  return { name, key: name.toLowerCase() }
}

export type Tone = 'green' | 'indigo' | 'amber' | 'stone'

// A message is an id plus parameters. The interface translates it, so this module stays language-neutral.
export interface Msg {
  id: string
  params?: Record<string, string | number>
}

export interface Assessment {
  label: Msg
  tone: Tone
  lines: Msg[]
}

// Victoria publishes no fixed pass mark, so competitiveness is relative to candidates in the pool.
export function assess(insights: Insights): Assessment {
  const { overall, occupation } = insights
  const lines: Msg[] = []

  if (isRanked(occupation)) {
    lines.push({ id: 'assess.lineOcc', params: { name: occupation.name, p: occupation.percentile, n: occupation.n } })
  } else if (occupation) {
    lines.push({ id: 'assess.lineOccWaiting', params: { name: occupation.name, n: occupation.n, min: MIN_OCCUPATION } })
  }

  if (!isRanked(overall)) {
    return {
      label: { id: 'assess.label.none' },
      tone: 'stone',
      lines: [{ id: 'assess.waiting', params: { n: overall.n, min: MIN_OVERALL } }, ...lines],
    }
  }

  const p = overall.percentile
  const [label, tone]: [string, Tone] =
    p >= 90 ? ['veryStrong', 'green']
    : p >= 70 ? ['strong', 'green']
    : p >= 40 ? ['mid', 'indigo']
    : p >= 15 ? ['below', 'amber']
    : ['low', 'amber']

  return {
    label: { id: `assess.label.${label}` },
    tone,
    lines: [
      { id: 'assess.lineOverall', params: { p, n: overall.n, loc: insights.location, median: overall.median } },
      ...lines,
    ],
  }
}

export interface Lever {
  label: Msg
  gain: number
}

const ENGLISH_NEXT = { competent: 'proficient', proficient: 'superior' } as const
const EDUCATION_NEXT = { other: 'bachelors', bachelors: 'masters', masters: 'phd' } as const
// Band codes as stored in experienceYears, with the id of the matching lever message.
const EXPERIENCE_STEPS = [
  { code: 1, id: 'lever.exp.under1' },
  { code: 2, id: 'lever.exp.1to3' },
  { code: 4, id: 'lever.exp.3to5' },
  { code: 6, id: 'lever.exp.6to8' },
  { code: 9, id: 'lever.exp.over8' },
]

// The largest point gains available through things a candidate can still change.
export function improvementLevers(input: VptInput, limit = 3): Lever[] {
  const base = calculateVpt(input).total
  const gain = (patch: Partial<VptInput>) => calculateVpt({ ...input, ...patch }).total - base
  const levers: Lever[] = []

  if (input.english !== 'superior') {
    const next = ENGLISH_NEXT[input.english]
    levers.push({ label: { id: `lever.english.${next}` }, gain: gain({ english: next }) })
  }
  if (input.education !== 'phd') {
    const next = EDUCATION_NEXT[input.education]
    levers.push({ label: { id: `lever.edu.${next}` }, gain: gain({ education: next }) })
  }
  const nextBand = EXPERIENCE_STEPS.find((b) => b.code > input.experienceYears)
  if (nextBand) {
    levers.push({ label: { id: nextBand.id }, gain: gain({ experienceYears: nextBand.code }) })
  }
  if (input.location === 'onshore' && input.annualEarnings < 170_000) {
    const target = input.annualEarnings < 80_000 ? 80_000 : Math.floor(input.annualEarnings / 10_000) * 10_000 + 10_000
    levers.push({
      label: { id: 'lever.earn', params: { amount: target.toLocaleString('en-AU') } },
      gain: gain({ annualEarnings: target }),
    })
  }
  if (!input.partnerQualifies) {
    levers.push({ label: { id: 'lever.partner' }, gain: gain({ partnerQualifies: true }) })
  }

  return levers.filter((l) => l.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, limit)
}
