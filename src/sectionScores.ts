import { agePoints, earningsPoints, experiencePoints, type CategoryKey } from '../supabase/functions/_shared/scoring'

const distinct = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)

// Every score a section can give, lowest first, so a chart can show a bar for each one even when no candidate has it.
export const SECTION_SCORES: Record<CategoryKey, number[]> = {
  age: distinct(Array.from({ length: 86 }, (_, i) => agePoints(14 + i))),
  english: [0, 100, 200],
  experience: distinct(Array.from({ length: 61 }, (_, i) => experiencePoints(i))),
  education: [25, 50, 75, 100],
  skillLevel: [0, 50],
  partner: [0, 50],
  earnings: distinct(Array.from({ length: 35 }, (_, i) => earningsPoints(i * 5_000))),
}

// The share of candidates a person is in the top of, from the share who scored below them (ties count as half).
// Never shown as less than 1%.
export function topPercent(percentile: number): number {
  return Math.min(100, Math.max(1, Math.round(100 - percentile)))
}

// The lower middle score of everyone in a section, or undefined with no candidates.
export function medianScore(dist: { points: number; count: number }[]): number | undefined {
  const sorted = [...dist].filter((d) => d.count > 0).sort((a, b) => a.points - b.points)
  const n = sorted.reduce((sum, d) => sum + d.count, 0)
  if (n === 0) return undefined
  let seen = 0
  for (const d of sorted) {
    seen += d.count
    if (seen >= Math.ceil(n / 2)) return d.points
  }
  return undefined
}
