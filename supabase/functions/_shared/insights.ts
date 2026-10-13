// Types and pure helpers for the submit-and-compare analysis.
// Shared by the browser and the edge function. The statistics come from Postgres (pool_stats).

import type { CategoryKey, Location } from './scoring.ts'

// The comparison opens once this many candidates have submitted overall.
export const MIN_OVERALL = 10
// A narrower group (location, occupation) only needs one other candidate, so there is someone to compare with.
export const MIN_GROUP = 2

export interface PoolStats {
  n: number
  // Share of candidates (0 to 100) scoring below this one, ties counted as half.
  percentile?: number
  median?: number
  // The scores 25% and 75% of candidates fall below.
  p25?: number
  p75?: number
  mean?: number
  // Where the mean score sits in the same ranking (0 to 100).
  meanPercentile?: number
  categoryAvg?: Partial<Record<CategoryKey, number>>
  // The same percentile for each section.
  categoryPercentile?: Partial<Record<CategoryKey, number>>
  // How many candidates scored each value in each section, lowest value first.
  categoryDist?: Partial<Record<CategoryKey, { points: number; count: number }[]>>
  // How many candidates have a total in each 10-point band: 96 bands, from 0 to 9 up to 950.
  scoreHist?: number[]
}

// One of the occupations with the most candidates.
export interface TopOccupation {
  code: string
  name: string
  n: number
  // Median total score.
  median: number
  // Median points in each section.
  categoryMedian?: Partial<Record<CategoryKey, number>>
}

export interface Insights {
  total: number
  location: Location
  overall: PoolStats
  // code is the ANZSCO code when the occupation was picked from the list, and null or absent for free text.
  // level is how many digits of the code the group shares (6 is the exact occupation, 4, 3 or 2 a wider group), and
  // prefix is that part of the code. Both are null or absent for free text.
  occupation: (PoolStats & { name: string; code?: string | null; level?: number | null; prefix?: string | null }) | null
  // The listed occupations with the most candidates, most common first.
  topOccupations?: TopOccupation[]
  // Candidates in the same location only.
  locationGroup?: PoolStats | null
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

export type ComparisonKind = 'all' | 'occupation' | 'location'

export interface ComparisonRow {
  kind: ComparisonKind
  // Candidates in the group, including this one.
  n: number
  // Undefined when this candidate is the only one in the group so far.
  percentile?: number
  median?: number
  p25?: number
  p75?: number
  // Candidates per 10-point band of the total, for the distribution graph.
  hist?: number[]
  // For the occupation row: how wide the group is. See Insights.occupation.
  level?: number | null
  prefix?: string | null
}

// The three groups a candidate's percentile is shown for: all candidates, their occupation and their location.
// Overall needs MIN_OVERALL candidates. The other two show as soon as another candidate is in them, and are left
// out when they hold exactly the same candidates as the overall row.
export function comparisonRows(insights: Insights): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const add = (kind: ComparisonKind, stats: PoolStats, extra: Partial<ComparisonRow> = {}) =>
    rows.push({
      kind,
      n: stats.n,
      percentile: isRanked(stats) ? stats.percentile : undefined,
      median: isRanked(stats) ? stats.median : undefined,
      p25: isRanked(stats) ? stats.p25 : undefined,
      p75: isRanked(stats) ? stats.p75 : undefined,
      hist: isRanked(stats) ? stats.scoreHist : undefined,
      ...extra,
    })

  if (isRanked(insights.overall)) add('all', insights.overall)
  if (insights.occupation) {
    add('occupation', insights.occupation, { level: insights.occupation.level, prefix: insights.occupation.prefix })
  }
  const { locationGroup } = insights
  if (locationGroup && locationGroup.n !== insights.overall.n) add('location', locationGroup)
  return rows
}
