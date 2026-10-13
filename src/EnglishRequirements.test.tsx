// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EnglishRequirementsLink } from './EnglishRequirements'
import { ENGLISH_REQUIREMENTS, ENGLISH_SOURCE } from './englishScores'
import { LangProvider } from './i18n'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const show = (initial?: 'competent' | 'proficient' | 'superior') =>
  render(<LangProvider><EnglishRequirementsLink initial={initial} /></LangProvider>)
const openIt = () => fireEvent.click(screen.getByText('See the minimum score for each test'))
const rowOf = (test: string) => within(screen.getByRole('dialog')).getByRole('row', { name: new RegExp(`^${test}`) })
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent)

describe('English score data', () => {
  it('matches the official Superior English table for tests from 7 August 2025', () => {
    expect(ENGLISH_REQUIREMENTS.superior.map((r) => [r.test, ...r.scores])).toEqual([
      ['PTE Academic', 69, 70, 85, 88],
      ['IELTS Academic / General', 8, 8, 8, 8],
      ['TOEFL iBT', 26, 27, 30, 28],
      ['Cambridge C1 Advanced', 186, 190, 210, 208],
      ['CELPIP General', 10, 10, 12, 10],
      ['OET', 390, 400, 420, 400],
      ['LANGUAGECERT Academic', 80, 83, 89, 89],
    ])
  })

  it('has the Proficient and Competent PTE and IELTS scores', () => {
    const find = (level: 'competent' | 'proficient', test: string) =>
      ENGLISH_REQUIREMENTS[level].find((r) => r.test === test)?.scores
    expect(find('proficient', 'PTE Academic')).toEqual([58, 59, 69, 76])
    expect(find('competent', 'PTE Academic')).toEqual([47, 48, 51, 54])
    expect(find('proficient', 'IELTS Academic / General')).toEqual([7, 7, 7, 7])
    expect(find('competent', 'IELTS Academic / General')).toEqual([6, 6, 6, 6])
  })

  it('raises every component from one level to the next', () => {
    for (const { test } of ENGLISH_REQUIREMENTS.superior) {
      const get = (l: 'competent' | 'proficient' | 'superior') => ENGLISH_REQUIREMENTS[l].find((r) => r.test === test)!.scores
      get('superior').forEach((s, i) => {
        expect(s, test).toBeGreaterThanOrEqual(get('proficient')[i])
        expect(get('proficient')[i], test).toBeGreaterThanOrEqual(get('competent')[i])
      })
    }
  })

  it('links to the official page for each level, without tracking parameters', () => {
    expect(ENGLISH_SOURCE.superior).toBe(
      'https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language/superior-english',
    )
    for (const url of Object.values(ENGLISH_SOURCE)) expect(url).not.toContain('?')
  })
})

describe('English requirements dialog', () => {
  it('is closed until the link is pressed', () => {
    show()
    expect(screen.queryByRole('dialog')).toBeNull()
    openIt()
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('English test score requirements')).toBeTruthy()
  })

  it('shows the table for the level it was opened with', () => {
    show('superior')
    openIt()
    expect(cells(rowOf('PTE Academic'))).toEqual(['69', '70', '85', '88'])
    expect(screen.getByRole('button', { name: 'Superior' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('starts on Competent when no level is chosen yet', () => {
    show()
    openIt()
    expect(cells(rowOf('PTE Academic'))).toEqual(['47', '48', '51', '54'])
  })

  it('switches tables with the tabs', () => {
    show()
    openIt()
    fireEvent.click(screen.getByRole('button', { name: 'Proficient' }))
    expect(cells(rowOf('PTE Academic'))).toEqual(['58', '59', '69', '76'])
    fireEvent.click(screen.getByRole('button', { name: 'Superior' }))
    expect(cells(rowOf('OET'))).toEqual(['390', '400', '420', '400'])
  })

  it('lists MET for Competent and Proficient but not Superior', () => {
    show()
    openIt()
    expect(within(screen.getByRole('dialog')).queryByRole('row', { name: /^MET/ })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Superior' }))
    expect(within(screen.getByRole('dialog')).queryByRole('row', { name: /^MET/ })).toBeNull()
  })

  it('labels the four components', () => {
    show()
    openIt()
    for (const col of ['Listening', 'Reading', 'Writing', 'Speaking']) {
      expect(within(screen.getByRole('dialog')).getByRole('columnheader', { name: col })).toBeTruthy()
    }
  })

  it('links to the Home Affairs page for the shown level', () => {
    show('superior')
    openIt()
    const link = screen.getByText(/View this table on the Home Affairs website/).closest('a')!
    expect(link.getAttribute('href')).toBe(ENGLISH_SOURCE.superior)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    fireEvent.click(screen.getByRole('button', { name: 'Competent' }))
    expect(screen.getByText(/View this table on the Home Affairs website/).closest('a')!.getAttribute('href')).toBe(ENGLISH_SOURCE.competent)
  })

  it('says every component must be met and that older tests follow an older table', () => {
    show()
    openIt()
    expect(screen.getByText('You must reach the minimum in all four components.')).toBeTruthy()
    expect(screen.getByText(/Tests taken on or before 6 August 2025 follow an older table/)).toBeTruthy()
    expect(screen.getByText(/on or after 7 August 2025/)).toBeTruthy()
  })

  it('closes with the close button and returns focus to the link', () => {
    show()
    openIt()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByText('See the minimum score for each test'))
  })

  it('closes with Escape', () => {
    show()
    openIt()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the backdrop is pressed, but not when the dialog itself is', () => {
    show()
    openIt()
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-backdrop]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves focus into the dialog and locks the page behind it while open', () => {
    show()
    openIt()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('is shown in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    show('proficient')
    fireEvent.click(screen.getByText('查看各考试的最低分数'))
    expect(screen.getByText('英语考试分数要求')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole('columnheader', { name: '听力' })).toBeTruthy()
    expect(screen.getByText('四个单项都必须达到最低分数。')).toBeTruthy()
  })
})
