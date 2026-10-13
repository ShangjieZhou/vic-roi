import { describe, expect, it } from 'vitest'
import {
  agePoints,
  calculateVpt,
  earningsPoints,
  experiencePoints,
  parseVptInput,
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
      age: 25, english: 'superior', experienceYears: 10, education: 'phd',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 200_000,
    })
    expect(r.total).toBe(950)
    expect(r.max).toBe(950)
  })

  it('sums a typical candidate with a per-category breakdown', () => {
    const r = calculateVpt({
      age: 32, english: 'proficient', experienceYears: 5, education: 'masters',
      skillLevel: 1, partnerQualifies: false, annualEarnings: 0,
    })
    expect(r.categories.map((c) => [c.key, c.points])).toEqual([
      ['age', 256], ['english', 100], ['experience', 60], ['education', 75],
      ['skillLevel', 50], ['partner', 0], ['earnings', 0],
    ])
    expect(r.total).toBe(541)
  })
})

describe('parseVptInput', () => {
  const valid = {
    age: 30, english: 'proficient', experienceYears: 3, education: 'bachelors',
    skillLevel: 1, partnerQualifies: false, annualEarnings: 90_000,
  }
  it('accepts valid input', () => expect(parseVptInput(valid)).not.toBeNull())
  it('rejects bad values', () => {
    expect(parseVptInput({ ...valid, english: 'native' })).toBeNull()
    expect(parseVptInput({ ...valid, age: 30.5 })).toBeNull()
    expect(parseVptInput({ ...valid, skillLevel: 4 })).toBeNull()
    expect(parseVptInput(null)).toBeNull()
  })
})
