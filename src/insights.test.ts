import { describe, expect, it } from 'vitest'
import {
  comparisonRows,
  isRanked,
  normalizeOccupation,
  type Insights,
} from '../supabase/functions/_shared/insights'

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

describe('isRanked', () => {
  it('is true once a percentile and median are present', () => {
    expect(isRanked({ n: 12, percentile: 40, median: 500 })).toBe(true)
  })
  it('is false for a group too small to rank, and for nothing', () => {
    expect(isRanked({ n: 3 })).toBe(false)
    expect(isRanked(null)).toBe(false)
    expect(isRanked(undefined)).toBe(false)
  })
})

describe('comparisonRows', () => {
  const base: Insights = {
    total: 500,
    location: 'onshore',
    overall: { n: 23, percentile: 54, median: 500 },
    locationGroup: { n: 15, percentile: 60, median: 500 },
    occupation: { name: 'Software engineer', code: '261313', n: 9, percentile: 93, median: 450 },
  }

  it('shows the percentile in exactly three contexts: all candidates, occupation and location', () => {
    expect(comparisonRows(base)).toEqual([
      { kind: 'all', n: 23, percentile: 54 },
      { kind: 'occupation', n: 9, percentile: 93 },
      { kind: 'location', n: 15, percentile: 60 },
    ])
  })

  it('shows a narrower group with as few as two candidates', () => {
    const rows = comparisonRows({
      ...base,
      locationGroup: { n: 2, percentile: 75, median: 500 },
      occupation: { name: 'Software engineer', code: '261313', n: 2, percentile: 75, median: 500 },
    })
    expect(rows.find((r) => r.kind === 'occupation')).toEqual({ kind: 'occupation', n: 2, percentile: 75 })
    expect(rows.find((r) => r.kind === 'location')).toEqual({ kind: 'location', n: 2, percentile: 75 })
  })

  it('keeps an occupation the candidate is alone in, without a rank', () => {
    const rows = comparisonRows({ ...base, occupation: { name: 'Software engineer', code: '261313', n: 1 } })
    expect(rows.find((r) => r.kind === 'occupation')).toEqual({ kind: 'occupation', n: 1, percentile: undefined })
  })

  it('leaves out the location row when every candidate is in the same location', () => {
    const rows = comparisonRows({ ...base, locationGroup: { n: 23, percentile: 54, median: 500 } })
    expect(rows.map((r) => r.kind)).toEqual(['all', 'occupation'])
  })

  it('has no occupation row when none was given', () => {
    expect(comparisonRows({ ...base, occupation: null }).map((r) => r.kind)).toEqual(['all', 'location'])
  })

  it('has no overall row until enough candidates have submitted', () => {
    expect(comparisonRows({ ...base, overall: { n: 6 } }).map((r) => r.kind)).toEqual(['occupation', 'location'])
  })

  it('copes with a server that sends no location group or occupation', () => {
    expect(comparisonRows({ total: 1, location: 'onshore', overall: { n: 23, percentile: 50, median: 500 }, occupation: null })).toEqual([
      { kind: 'all', n: 23, percentile: 50 },
    ])
  })
})
