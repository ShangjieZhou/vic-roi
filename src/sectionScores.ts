import { agePoints, earningsPoints, EARNINGS_CAP, EARNINGS_MIN, experiencePoints, type CategoryKey } from '../supabase/functions/_shared/scoring'

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

// What a candidate chose to earn a score in a section, as a message key and its values. The wizard stores
// experience as band codes, so this reverses the points back into the answer.
export interface Selection {
  key: string
  params?: Record<string, string | number>
}

const EXPERIENCE_CODE: Record<number, number> = { 0: 0, 20: 1, 40: 2, 60: 4, 80: 6, 100: 9 }
const EDUCATION_KEY: Record<number, string> = { 25: 'other', 50: 'bachelors', 75: 'masters', 100: 'phd' }
const ENGLISH_KEY: Record<number, string> = { 0: 'competent', 100: 'proficient', 200: 'superior' }

export function selectionFor(category: CategoryKey, points: number): Selection | null {
  switch (category) {
    case 'age': {
      const ages = Array.from({ length: 86 }, (_, i) => 14 + i).filter((a) => agePoints(a) === points)
      if (points === 0 || ages.length === 0) return { key: 'sel.age.other' }
      return ages.length === 1
        ? { key: 'sel.age', params: { a: ages[0] } }
        : { key: 'sel.ages', params: { a: ages[0], b: ages[ages.length - 1] } }
    }
    case 'english':
      return ENGLISH_KEY[points] ? { key: `opt.english.${ENGLISH_KEY[points]}` } : null
    case 'experience':
      return points in EXPERIENCE_CODE ? { key: `opt.exp.${EXPERIENCE_CODE[points]}` } : null
    case 'education':
      return EDUCATION_KEY[points] ? { key: `opt.edu.${EDUCATION_KEY[points]}` } : null
    case 'skillLevel':
      return { key: points === 50 ? 'opt.skill.1' : 'sel.skill.other' }
    case 'partner':
      return { key: points > 0 ? 'sel.partner.yes' : 'sel.partner.no' }
    case 'earnings': {
      if (points === 0) return { key: 'sel.earn.zero' }
      for (let from = EARNINGS_MIN; from <= EARNINGS_CAP; from += 5_000) {
        if (earningsPoints(from) !== points) continue
        return from >= EARNINGS_CAP
          ? { key: 'sel.earn.max', params: { from: from.toLocaleString('en-AU') } }
          : { key: 'sel.earn.band', params: { from: from.toLocaleString('en-AU'), to: (from + 4_999).toLocaleString('en-AU') } }
      }
      return null
    }
  }
}
