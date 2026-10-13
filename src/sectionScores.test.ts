import { describe, expect, it } from 'vitest'
import { calculateVpt, type VptInput } from '../supabase/functions/_shared/scoring'
import { SECTION_SCORES, medianScore, selectionFor, topPercent } from './sectionScores'

describe('SECTION_SCORES', () => {
  it('lists every discrete score, lowest first', () => {
    expect(SECTION_SCORES.english).toEqual([0, 100, 200])
    expect(SECTION_SCORES.experience).toEqual([0, 20, 40, 60, 80, 100])
    expect(SECTION_SCORES.earnings).toHaveLength(20)
    expect(SECTION_SCORES.earnings[0]).toBe(0)
    expect(SECTION_SCORES.earnings.at(-1)).toBe(150)
    expect(SECTION_SCORES.age).toContain(300)
    expect(SECTION_SCORES.age).toContain(16)
    expect(SECTION_SCORES.age[0]).toBe(0)
    for (const list of Object.values(SECTION_SCORES)) expect(list).toEqual([...list].sort((a, b) => a - b))
  })

  it('covers the maximum of each section', () => {
    const best: VptInput = {
      location: 'onshore', age: 25, english: 'superior', experienceYears: 9, education: 'phd',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 200_000,
    }
    for (const c of calculateVpt(best).categories) expect(SECTION_SCORES[c.key]).toContain(c.points)
  })
})

describe('topPercent', () => {
  it('turns the share below into the share in the top, within 1 to 100', () => {
    expect(topPercent(63)).toBe(37)
    expect(topPercent(50)).toBe(50)
    expect(topPercent(99.8)).toBe(1)
    expect(topPercent(0)).toBe(100)
  })
})

describe('medianScore', () => {
  it('takes the lower middle score', () => {
    expect(medianScore([{ points: 286, count: 4 }, { points: 300, count: 8 }])).toBe(300)
    expect(medianScore([{ points: 0, count: 2 }, { points: 50, count: 2 }])).toBe(0)
    expect(medianScore([{ points: 10, count: 1 }, { points: 20, count: 1 }, { points: 30, count: 1 }])).toBe(20)
  })
  it('is undefined with no candidates', () => expect(medianScore([])).toBeUndefined())
})

describe('selectionFor', () => {
  it('names what earns each median score', () => {
    expect(selectionFor('experience', 40)).toEqual({ key: 'opt.exp.2' })
    expect(selectionFor('experience', 100)).toEqual({ key: 'opt.exp.9' })
    expect(selectionFor('english', 200)).toEqual({ key: 'opt.english.superior' })
    expect(selectionFor('education', 75)).toEqual({ key: 'opt.edu.masters' })
    expect(selectionFor('skillLevel', 50)).toEqual({ key: 'opt.skill.1' })
    expect(selectionFor('partner', 50)).toEqual({ key: 'sel.partner.yes' })
    expect(selectionFor('age', 300)).toEqual({ key: 'sel.ages', params: { a: 20, b: 29 } })
    expect(selectionFor('age', 286)).toEqual({ key: 'sel.age', params: { a: 30 } })
    expect(selectionFor('age', 0)).toEqual({ key: 'sel.age.other' })
    expect(selectionFor('earnings', 0)).toEqual({ key: 'sel.earn.zero' })
    expect(selectionFor('earnings', 8)).toEqual({ key: 'sel.earn.band', params: { from: '80,000', to: '84,999' } })
    expect(selectionFor('earnings', 150)).toEqual({ key: 'sel.earn.max', params: { from: '170,000' } })
  })

  it('has a selection for every listed score', () => {
    for (const [key, list] of Object.entries(SECTION_SCORES))
      for (const points of list) expect(selectionFor(key as never, points), `${key} ${points}`).not.toBeNull()
  })
})
