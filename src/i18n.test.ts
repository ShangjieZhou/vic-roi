import { describe, expect, it } from 'vitest'
import { assess, improvementLevers, type Insights } from '../supabase/functions/_shared/insights'
import type { EducationLevel, EnglishLevel, VptInput } from '../supabase/functions/_shared/scoring'
import { en, ordinal } from './i18n/en'
import { zh } from './i18n/zh'
import { translate, type Key } from './i18n'

const keys = Object.keys(en) as Key[]
// Rich enough that every function message has the parameters it reads.
const params = { n: 7, total: 8, max: 950, count: 2, minutes: 3, p: 40, p25: 400, p75: 600, a: 100, b: 200, loc: 'onshore', amount: '80,000', name: 'Nurse', min: 10, median: 500 }

describe('translations', () => {
  it('provide every key in both languages', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it.each(keys)('%s renders non-empty text with no unfilled placeholder', (key) => {
    for (const lang of ['en', 'zh'] as const) {
      const text = translate(lang, key, params)
      expect(text.trim().length).toBeGreaterThan(0)
      expect(text).not.toMatch(/\{\w+\}/)
    }
  })

  // Compares rendered output, so it also covers messages written as functions (plurals, ordinals).
  it('show the same dynamic values in both languages', () => {
    const distinct = {
      n: 7311, total: 8422, max: 9533, minutes: 3333, p: 4747, p25: 2525, p75: 7575, a: 1111, b: 2222,
      median: 5050, min: 1010, amount: '80,000', name: 'Nurse', count: 2, loc: 'onshore',
    }
    // loc is translated (onshore versus 境内) and count only picks wording, so neither is shown verbatim.
    const shown = Object.entries(distinct).filter(([name]) => name !== 'loc' && name !== 'count')
    for (const key of keys) {
      const english = translate('en', key, distinct)
      const chinese = translate('zh', key, distinct)
      for (const [name, value] of shown) {
        expect(chinese.includes(String(value)), `${key}: {${name}} in zh matches en`).toBe(english.includes(String(value)))
      }
    }
  })

  it('keep the scoring-critical wording faithful', () => {
    expect(translate('zh', 'partner.req1')).toContain('SkillSelect')
    expect(translate('zh', 'opt.english.superior.hint')).toContain('PTE 79')
    expect(translate('zh', 'opt.english.superior.hint')).toContain('雅思 8')
    expect(translate('zh', 'q.earn.offshore.hint')).toContain('800')
  })

  it('cover every message the shared insights module can emit', () => {
    const ids = new Set<string>()
    const add = (m: { id: string }) => ids.add(m.id)

    const stats = { n: 50, percentile: 50, median: 500 }
    for (const percentile of [95, 75, 50, 20, 5]) {
      for (const occupation of [null, { name: 'X', n: 9, percentile: 50, median: 500 }, { name: 'X', n: 2 }]) {
        const a = assess({ total: 500, location: 'onshore', overall: { ...stats, percentile }, occupation } as Insights)
        add(a.label)
        a.lines.forEach(add)
      }
    }
    const waiting = assess({ total: 1, location: 'offshore', overall: { n: 1 }, occupation: null })
    add(waiting.label)
    waiting.lines.forEach(add)

    const english: EnglishLevel[] = ['competent', 'proficient']
    const education: EducationLevel[] = ['other', 'bachelors', 'masters']
    for (const e of english) for (const d of education) for (const experienceYears of [0, 1, 2, 4, 6]) for (const annualEarnings of [0, 100_000]) {
      const input: VptInput = { location: 'onshore', age: 30, english: e, education: d, experienceYears, skillLevel: 1, partnerQualifies: false, annualEarnings }
      improvementLevers(input, 10).forEach((l) => add(l.label))
    }

    expect(ids.size).toBeGreaterThan(15)
    for (const id of ids) {
      expect(id in en, `en missing ${id}`).toBe(true)
      expect(id in zh, `zh missing ${id}`).toBe(true)
    }
  })
})

describe('ordinal', () => {
  it.each([
    [0, '0th'], [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'], [11, '11th'], [12, '12th'], [13, '13th'],
    [21, '21st'], [22, '22nd'], [23, '23rd'], [47, '47th'], [50, '50th'], [78, '78th'], [100, '100th'],
  ])('%i -> %s', (n, text) => expect(ordinal(n)).toBe(text))

  it('renders section percentiles in both languages', () => {
    expect(translate('en', 'ins.pct', { p: 22 })).toBe('22nd percentile')
    expect(translate('zh', 'ins.pct', { p: 22 })).toBe('第 22 百分位')
  })
})
