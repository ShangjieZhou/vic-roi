import { describe, expect, it } from 'vitest'
import { OCCUPATIONS, OCCUPATION_BY_CODE, occupationGroup } from '../supabase/functions/_shared/occupations'
import { OCCUPATION_ZH } from './occupationNames'
import { occupationDisplayName, occupationLabel, searchOccupations } from './occupationSearch'

describe('occupation data', () => {
  it('matches the legislation: 504 occupations, 427 for subclass 190 and 77 regional only', () => {
    expect(OCCUPATIONS).toHaveLength(504)
    expect(OCCUPATIONS.filter((o) => o.visa190)).toHaveLength(427)
    expect(OCCUPATIONS.filter((o) => !o.visa190)).toHaveLength(77)
  })

  it('has unique six-digit ANZSCO codes and non-empty titles', () => {
    expect(new Set(OCCUPATIONS.map((o) => o.code)).size).toBe(504)
    for (const o of OCCUPATIONS) {
      expect(o.code).toMatch(/^\d{6}$/)
      expect(o.title.trim().length).toBeGreaterThan(2)
      expect(o.title[0]).toBe(o.title[0].toUpperCase())
    }
  })

  it('has a Chinese name for every occupation and no stray ones', () => {
    expect(Object.keys(OCCUPATION_ZH).sort()).toEqual(OCCUPATIONS.map((o) => o.code).sort())
    for (const name of Object.values(OCCUPATION_ZH)) expect(name.trim().length).toBeGreaterThan(0)
  })

  it('spot checks well known entries', () => {
    expect(OCCUPATION_BY_CODE.get('261313')).toEqual({ code: '261313', title: 'Software engineer', visa190: true })
    expect(OCCUPATION_BY_CODE.get('121111')?.visa190).toBe(false) // aquaculture farmer: 491 only
    expect(OCCUPATION_BY_CODE.get('139999')?.title).toBe('Specialist managers (nec), except ambassador, archbishop or bishop')
    expect(OCCUPATION_ZH['261313']).toBe('软件工程师')
  })

  it('derives the group from the first two digits', () => {
    expect(occupationGroup('261313')).toBe('26')
    expect(occupationGroup('254412')).toBe('25')
  })
})

describe('searchOccupations', () => {
  const codes = (q: string, limit?: number) => searchOccupations(q, limit).map((o) => o.code)

  it('finds an exact title first', () => {
    expect(codes('software engineer')[0]).toBe('261313')
    expect(codes('Software Engineer')[0]).toBe('261313')
  })

  it('finds by code', () => {
    expect(codes('261313')[0]).toBe('261313')
    expect(codes('2613')).toContain('261313')
  })

  it('finds by Chinese name', () => {
    expect(codes('软件工程师')[0]).toBe('261313')
    expect(codes('护士')).toContain('254412')
    expect(codes('会计')).toContain('221111')
  })

  it('finds by everyday names that differ from the official title', () => {
    expect(codes('developer')).toEqual(expect.arrayContaining(['261313', '261312']))
    expect(codes('doctor')).toContain('253111')
    expect(codes('helpdesk')).toContain('313112')
    expect(codes('physio')).toContain('252511')
  })

  it('matches words in any order and partial words', () => {
    expect(codes('engineer software')).toContain('261313')
    expect(codes('regist nurs')).toContain('254412')
    expect(codes('nurs')).toContain('254412')
  })

  it('returns nothing for blank or unmatched input and respects the limit', () => {
    expect(searchOccupations('')).toEqual([])
    expect(searchOccupations('   ')).toEqual([])
    expect(searchOccupations('zzzzqqq')).toEqual([])
    expect(searchOccupations('engineer', 5)).toHaveLength(5)
    expect(searchOccupations('manager').length).toBeLessThanOrEqual(8)
  })

  it('ranks closer matches above looser ones', () => {
    const list = codes('chef')
    expect(list[0]).toBe('351311')
  })
})

describe('labels', () => {
  it('shows the English title in English', () => {
    expect(occupationLabel('261313', 'en')).toEqual({ primary: 'Software engineer', secondary: null })
    expect(occupationDisplayName('261313', 'en')).toBe('Software engineer')
  })

  it('shows Chinese with the English title beside it, since that is the name on the EOI', () => {
    expect(occupationLabel('261313', 'zh')).toEqual({ primary: '软件工程师', secondary: 'Software engineer' })
    expect(occupationDisplayName('261313', 'zh')).toBe('软件工程师（Software engineer）')
  })

  it('falls back safely for an unknown code', () => {
    expect(occupationLabel('999999', 'zh')).toEqual({ primary: '999999', secondary: null })
  })
})
