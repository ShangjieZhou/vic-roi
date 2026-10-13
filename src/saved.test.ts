// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { addToHistory, clearHistory, loadHistory, removeFromHistory, timeAgo, type HistoryEntry } from './saved'

const entry = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: `2ceb142f-cccc-4081-834a-13${String(n).padStart(10, '0')}`,
  total: 500 + n,
  location: 'onshore',
  occupation: null,
  savedAt: 1_700_000_000_000 + n * 1000,
  ...over,
})

afterEach(() => localStorage.clear())

describe('submission history', () => {
  it('starts empty and keeps the newest submission first', () => {
    expect(loadHistory()).toEqual([])
    addToHistory(entry(1))
    addToHistory(entry(3, { occupation: 'Nurse', location: 'offshore' }))
    addToHistory(entry(2))
    expect(loadHistory().map((e) => e.total)).toEqual([503, 502, 501])
    expect(loadHistory()[0]).toMatchObject({ occupation: 'Nurse', location: 'offshore' })
  })

  it('replaces an entry for the same result instead of duplicating it', () => {
    addToHistory(entry(1))
    addToHistory(entry(1, { total: 999 }))
    expect(loadHistory()).toHaveLength(1)
    expect(loadHistory()[0].total).toBe(999)
  })

  it('removes one entry, then clears everything', () => {
    addToHistory(entry(1))
    addToHistory(entry(2))
    expect(removeFromHistory(entry(1).id).map((e) => e.total)).toEqual([502])
    clearHistory()
    expect(loadHistory()).toEqual([])
  })

  it('keeps only the 50 most recent entries', () => {
    for (let n = 1; n <= 55; n++) addToHistory(entry(n))
    const list = loadHistory()
    expect(list).toHaveLength(50)
    expect(list[0].total).toBe(555)
    expect(list.at(-1)?.total).toBe(506)
  })

  it('drops corrupt entries but keeps the valid ones', () => {
    localStorage.setItem(
      'vpt-history',
      JSON.stringify([entry(1), { id: 'nope' }, { ...entry(2), location: 'mars' }, { ...entry(3), total: 'high' }, null, 42]),
    )
    expect(loadHistory().map((e) => e.total)).toEqual([501])
  })

  it.each([['not json', '{oops'], ['not an array', JSON.stringify({ a: 1 })]])('treats %s as empty', (_n, raw) => {
    localStorage.setItem('vpt-history', raw)
    expect(loadHistory()).toEqual([])
  })

  it('migrates the single result stored by the previous version', () => {
    const { occupation: _omit, ...legacy } = entry(7)
    localStorage.setItem('vpt-submission', JSON.stringify(legacy))
    expect(loadHistory()).toEqual([{ ...legacy, occupation: null }])
    expect(localStorage.getItem('vpt-submission')).toBeNull()
    expect(JSON.parse(localStorage.getItem('vpt-history')!)).toHaveLength(1)
  })

  it('ignores a corrupt legacy value', () => {
    localStorage.setItem('vpt-submission', '{oops')
    expect(loadHistory()).toEqual([])
  })
})

describe('timeAgo', () => {
  const now = 1_700_000_000_000
  it('reads naturally in English and Chinese', () => {
    expect(timeAgo(now - 5 * 60_000, 'en', now)).toBe('5 minutes ago')
    expect(timeAgo(now - 3 * 3_600_000, 'en', now)).toBe('3 hours ago')
    expect(timeAgo(now - 2 * 86_400_000, 'en', now)).toBe('2 days ago')
    expect(timeAgo(now - 4 * 86_400_000, 'zh', now)).toBe('4天前')
  })
  it('does not go negative for a clock that moved backwards', () => {
    expect(timeAgo(now + 60_000, 'en', now)).toBe('now')
  })
})
