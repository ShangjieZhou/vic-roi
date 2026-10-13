import { describe, expect, it } from 'vitest'
import {
  agePoints,
  calculateRange,
  calculateVpt,
  earningsPoints,
  experiencePoints,
  parseVptInput,
  resolveDraft,
  type VptDraft,
} from '../supabase/functions/_shared/scoring'

describe('agePoints', () => {
  it.each([
    [17, 0], [18, 265], [19, 282], [20, 300], [25, 300], [29, 300],
    [30, 286], [31, 270], [35, 210], [40, 136], [41, 106], [44, 16], [45, 0],
  ])('age %i -> %i', (age, pts) => expect(agePoints(age)).toBe(pts))
})

describe('experiencePoints', () => {
  it.each([
    [0, 0], [1, 20], [2, 40], [3, 40], [4, 60], [5, 60], [6, 80], [8, 80], [9, 100], [15, 100],
  ])('%i years -> %i', (yrs, pts) => expect(experiencePoints(yrs)).toBe(pts))
})

describe('earningsPoints', () => {
  it.each([
    [0, 0], [79_999, 0], [80_000, 8], [84_999, 8], [85_000, 16], [99_999, 32],
    [100_000, 39], [105_000, 47], [119_999, 63], [140_000, 103], [145_000, 111],
    [150_000, 118], [160_000, 134], [169_999, 142], [170_000, 150], [300_000, 150],
  ])('$%i -> %i', (amt, pts) => expect(earningsPoints(amt)).toBe(pts))
})

describe('calculateVpt', () => {
  it('scores the maximum at 950', () => {
    const r = calculateVpt({
      location: 'onshore', age: 25, english: 'superior', experienceYears: 10, education: 'phd',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 200_000,
    })
    expect(r.total).toBe(950)
    expect(r.max).toBe(950)
  })

  it('sums a typical candidate with a per-category breakdown', () => {
    const r = calculateVpt({
      location: 'onshore', age: 32, english: 'proficient', experienceYears: 5, education: 'masters',
      skillLevel: 1, partnerQualifies: false, annualEarnings: 0,
    })
    expect(r.categories.map((c) => [c.key, c.points])).toEqual([
      ['age', 256], ['english', 100], ['experience', 60], ['education', 75],
      ['skillLevel', 50], ['partner', 0], ['earnings', 0],
    ])
    expect(r.total).toBe(541)
  })
})

describe('offshore', () => {
  const base = {
    location: 'offshore' as const, age: 25, english: 'superior' as const, experienceYears: 10,
    education: 'phd' as const, skillLevel: 1 as const, partnerQualifies: true, annualEarnings: 200_000,
  }
  it('drops Victorian earnings from the score and the maximum', () => {
    const r = calculateVpt(base)
    expect(r.max).toBe(800)
    expect(r.total).toBe(800)
    const earnings = r.categories.find((c) => c.key === 'earnings')!
    expect(earnings).toMatchObject({ points: 0, applicable: false })
  })
  it('ignores any earnings value offshore', () => {
    expect(calculateVpt({ ...base, annualEarnings: 0 }).total).toBe(calculateVpt(base).total)
  })
})

describe('calculateRange', () => {
  const draft: VptDraft = {
    location: 'onshore', age: 30, english: 'proficient', experienceYears: 4, education: 'bachelors',
    skillLevel: 'unsure', partnerQualifies: 'unsure', annualEarnings: 0,
  }
  it('spans the skipped answers', () => {
    const { low, high, exact } = calculateRange(draft)
    expect(exact).toBe(false)
    expect(high.total - low.total).toBe(100)
    expect(low.total).toBe(286 + 100 + 60 + 50)
  })
  it('widens by 50 for one skipped answer', () => {
    const { low, high } = calculateRange({ ...draft, partnerQualifies: false })
    expect(high.total - low.total).toBe(50)
  })
  it('is exact once everything is answered', () => {
    const { low, high, exact } = calculateRange({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(exact).toBe(true)
    expect(low.total).toBe(high.total)
  })
  it('only resolves a fully answered draft', () => {
    expect(resolveDraft(draft)).toBeNull()
    expect(resolveDraft({ ...draft, skillLevel: 2, partnerQualifies: true })).not.toBeNull()
  })
})

describe('parseVptInput', () => {
  const valid = {
    location: 'onshore',
    age: 30, english: 'proficient', experienceYears: 3, education: 'bachelors',
    skillLevel: 1, partnerQualifies: false, annualEarnings: 90_000,
  }
  it('accepts valid input', () => expect(parseVptInput(valid)).not.toBeNull())
  it('rejects bad values', () => {
    expect(parseVptInput({ ...valid, english: 'native' })).toBeNull()
    expect(parseVptInput({ ...valid, age: 30.5 })).toBeNull()
    expect(parseVptInput({ ...valid, skillLevel: 4 })).toBeNull()
    expect(parseVptInput({ ...valid, location: 'overseas' })).toBeNull()
    expect(parseVptInput({ ...valid, location: undefined })).toBeNull()
    expect(parseVptInput({ ...valid, skillLevel: 'unsure' })).toBeNull()
    expect(parseVptInput({ ...valid, partnerQualifies: 'unsure' })).toBeNull()
    expect(parseVptInput(null)).toBeNull()
  })
})
