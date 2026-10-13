import { describe, expect, it } from 'vitest'
import {
  assess,
  improvementLevers,
  normalizeOccupation,
  type Insights,
} from '../supabase/functions/_shared/insights'
import type { VptInput } from '../supabase/functions/_shared/scoring'
import { translate, type Key } from './i18n'

const input: VptInput = {
  location: 'onshore', age: 30, english: 'competent', experienceYears: 3, education: 'bachelors',
  skillLevel: 1, partnerQualifies: false, annualEarnings: 0,
}

describe('normalizeOccupation', () => {
  it('treats empty as none', () => {
    expect(normalizeOccupation(undefined)).toBeNull()
    expect(normalizeOccupation('   ')).toBeNull()
  })
  it('trims, collapses spaces and lowercases the key', () => {
    expect(normalizeOccupation('  Software   Engineer ')).toEqual({ name: 'Software Engineer', key: 'software engineer' })
  })
  it('accepts common punctuation', () => {
    expect(normalizeOccupation("Cook (Chef) / Baker's-Aide, Sr.")).not.toBe('invalid')
  })
  it('rejects markup, symbols and bad lengths', () => {
    expect(normalizeOccupation('<script>')).toBe('invalid')
    expect(normalizeOccupation('a')).toBe('invalid')
    expect(normalizeOccupation('x'.repeat(81))).toBe('invalid')
    expect(normalizeOccupation(42)).toBe('invalid')
  })
})

describe('assess', () => {
  const ranked = (percentile: number): Insights => ({
    total: 500,
    location: 'onshore',
    overall: { n: 50, percentile, median: 480 },
    occupation: null,
  })

  it('reports too little data below the minimum pool', () => {
    const a = assess({ total: 500, location: 'onshore', overall: { n: 3 }, occupation: null })
    expect(a.label.id).toBe('assess.label.none')
    expect(a.lines[0]).toEqual({ id: 'assess.waiting', params: { n: 3, min: 10 } })
  })
  it.each([
    [95, 'veryStrong'], [90, 'veryStrong'], [75, 'strong'], [50, 'mid'], [20, 'below'], [5, 'low'],
  ])('percentile %i -> %s', (p, label) => expect(assess(ranked(p)).label.id).toBe(`assess.label.${label}`))

  it('describes the overall ranking with the location', () => {
    expect(assess(ranked(60)).lines[0]).toEqual({
      id: 'assess.lineOverall',
      params: { p: 60, n: 50, loc: 'onshore', median: 480 },
    })
  })

  it('adds an occupation line when ranked and a waiting line when not', () => {
    const withOcc = assess({ ...ranked(60), occupation: { name: 'Nurse', n: 12, percentile: 80, median: 500 } })
    expect(withOcc.lines[1]).toEqual({ id: 'assess.lineOcc', params: { name: 'Nurse', p: 80, n: 12 } })
    const waiting = assess({ ...ranked(60), occupation: { name: 'Nurse', n: 2 } })
    expect(waiting.lines[1]).toEqual({ id: 'assess.lineOccWaiting', params: { name: 'Nurse', n: 2, min: 5 } })
  })
})

describe('improvementLevers', () => {
  it('ranks the largest gains first and limits to three', () => {
    const levers = improvementLevers(input)
    expect(levers).toHaveLength(3)
    expect(levers[0]).toMatchObject({ label: { id: 'lever.english.proficient' }, gain: 100 })
    expect(levers[1].gain).toBe(50)
    expect(levers.map((l) => l.gain)).toEqual([...levers.map((l) => l.gain)].sort((a, b) => b - a))
  })
  it('offers nothing when maxed out', () => {
    const maxed: VptInput = {
      location: 'onshore', age: 25, english: 'superior', experienceYears: 10, education: 'phd',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 200_000,
    }
    expect(improvementLevers(maxed)).toEqual([])
  })
  it('never suggests Victorian earnings to offshore candidates', () => {
    const levers = improvementLevers({ ...input, location: 'offshore', english: 'superior', education: 'phd', experienceYears: 9, partnerQualifies: true }, 5)
    expect(levers).toEqual([])
  })
  it('names both PTE and IELTS for English levers', () => {
    expect(translate('en', improvementLevers(input)[0].label.id as Key)).toBe('Reach Proficient English (PTE 65 or IELTS 7)')
    expect(translate('zh', improvementLevers(input)[0].label.id as Key)).toBe('达到熟练英语（PTE 65 或雅思 7）')
  })
  it('targets the $80,000 threshold for low earners', () => {
    const levers = improvementLevers({ ...input, english: 'superior', education: 'phd', experienceYears: 9, partnerQualifies: true }, 5)
    expect(levers[0].label).toEqual({ id: 'lever.earn', params: { amount: '80,000' } })
    expect(levers[0].gain).toBe(8)
  })
})
