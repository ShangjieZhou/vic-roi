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
  mean?: number
  // Where the mean score sits in the same ranking (0 to 100).
  meanPercentile?: number
  categoryAvg?: Partial<Record<CategoryKey, number>>
  // The same percentile for each section.
  categoryPercentile?: Partial<Record<CategoryKey, number>>
  // How many candidates scored each value in each section, lowest value first.
  categoryDist?: Partial<Record<CategoryKey, { points: number; count: number }[]>>
}

export interface Insights {
  total: number
  location: Location
  overall: PoolStats
  // code is the ANZSCO code when the occupation was picked from the list, and null or absent for free text.
  occupation: (PoolStats & { name: string; code?: string | null }) | null
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
}

// The three groups a candidate's percentile is shown for: all candidates, their occupation and their location.
// Overall needs MIN_OVERALL candidates. The other two show as soon as another candidate is in them, and are left
// out when they hold exactly the same candidates as the overall row.
export function comparisonRows(insights: Insights): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const add = (kind: ComparisonKind, stats: PoolStats) =>
    rows.push({ kind, n: stats.n, percentile: isRanked(stats) ? stats.percentile : undefined })

  if (isRanked(insights.overall)) add('all', insights.overall)
  if (insights.occupation) add('occupation', insights.occupation)
  const { locationGroup } = insights
  if (locationGroup && locationGroup.n !== insights.overall.n) add('location', locationGroup)
  return rows
}
