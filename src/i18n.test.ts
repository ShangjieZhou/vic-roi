import { describe, expect, it } from 'vitest'
import { en } from './i18n/en'
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
    expect(translate('zh', 'q.earn.offshore.hint')).toContain('0 分')
    expect(translate('en', 'q.earn.offshore.hint')).toContain('0 income points')
  })
})

describe('top percent', () => {
  it('renders in both languages', () => {
    expect(translate('en', 'ins.pct', { p: 22 })).toBe('Top 22%')
    expect(translate('zh', 'ins.pct', { p: 22 })).toBe('前22%')
  })
})
