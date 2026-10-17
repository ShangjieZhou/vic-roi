// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Insights } from '../../supabase/functions/_shared/insights'
import { calculateVpt } from '../../supabase/functions/_shared/scoring'
import { AdminApp, pageFor } from './AdminApp'
import { saveSession } from './auth'
import { barLabel } from './Overview'
import {
  addRule, buildFilters, describeSort, emptyFilters, moveRule, removeRule, setRuleField, toggleRule, type SortRule,
} from './submissionQuery'
import * as types from './types'
import type { SubmissionRow } from './types'

vi.mock('./types', async (original) => ({
  ...(await original<typeof import('./types')>()),
  loadStats: vi.fn(),
  loadTimeline: vi.fn(),
  loadSubmissions: vi.fn(),
  simulateRanking: vi.fn(),
  updateSubmission: vi.fn(),
  deleteSubmission: vi.fn(),
}))
// The occupation list search is heavy and not under test here.
vi.mock('../OccupationPicker', () => ({
  OccupationPicker: (p: { value: unknown; onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => p.onChange({ kind: 'listed', code: '261313' })}>
      pick occupation
    </button>
  ),
}))

const row = (over: Partial<SubmissionRow> = {}): SubmissionRow => ({
  id: '2ceb142f-cccc-4081-834a-133f83343775', at: '2026-10-15T23:00:00Z', total: 640, age: 31, english: 'superior',
  experience: 5, education: 'masters', skill: 1, partner: true, income: 95000, location: 'onshore',
  occupation: 'Software Engineer', code: '261313',
  breakdown: [{ key: 'age', points: 270, max: 300 }, { key: 'english', points: 200, max: 200 }], ...over,
})

const ranked: Insights = {
  total: 640, location: 'onshore',
  overall: { n: 120, percentile: 70, median: 615, p25: 545, p75: 666, scoreHist: Array.from({ length: 96 }, (_, i) => (i === 64 ? 10 : 1)) },
  locationGroup: { n: 90, percentile: 72, median: 620 },
  occupation: null,
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/admin/submissions')
  saveSession({ token: 'tok', expiresAt: Date.now() + 600_000 })
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.mocked(types.loadStats).mockReset().mockResolvedValue({ status: 'error' })
  vi.mocked(types.loadTimeline).mockReset().mockResolvedValue({ status: 'error' })
  vi.mocked(types.loadSubmissions).mockReset().mockResolvedValue({ status: 'ok', data: { total: 1, rows: [row()] } })
  vi.mocked(types.simulateRanking).mockReset()
  vi.mocked(types.updateSubmission).mockReset().mockResolvedValue({ status: 'ok', data: undefined })
  vi.mocked(types.deleteSubmission).mockReset().mockResolvedValue({ status: 'ok', data: undefined })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const lastQuery = () => vi.mocked(types.loadSubmissions).mock.calls.at(-1)![1]

describe('pageFor', () => {
  it.each([
    ['/admin', 'overview'],
    ['/admin/', 'overview'],
    ['/admin/submissions', 'submissions'],
    ['/admin/simulator', 'simulator'],
    ['/admin/unknown', 'overview'],
  ])('%s opens %s', (path, page) => expect(pageFor(path)).toBe(page))
})

describe('buildFilters', () => {
  it('sends nothing for an empty form', () => expect(buildFilters(emptyFilters)).toEqual({}))
  it('keeps the ranges, rounding whole-number bounds inward', () => {
    expect(buildFilters({ ...emptyFilters, ageMin: '25.5', ageMax: '39.5', scoreMin: '600', incomeMax: '120000.5' })).toEqual({
      ageMin: 26, ageMax: 39, scoreMin: 600, incomeMax: 120000.5,
    })
  })
  it('ignores text that is not a number and blank boxes', () => {
    expect(buildFilters({ ...emptyFilters, ageMin: 'abc', scoreMax: '   ' })).toEqual({})
  })
  it('sends selections, the occupation text and the partner choice', () => {
    expect(buildFilters({ ...emptyFilters, occupation: '  nurse ', english: ['superior'], experience: ['4', '6'], partner: 'no' })).toEqual({
      occupation: 'nurse', english: ['superior'], experience: ['4', '6'], partner: 'no',
    })
  })
})

describe('sort rules', () => {
  const rules: SortRule[] = [{ f: 'total', d: 'desc' }, { f: 'age', d: 'asc' }]
  it('adds the next unused field and stops at three', () => {
    expect(addRule(rules)).toEqual([...rules, { f: 'income', d: 'desc' }])
    expect(addRule(addRule(rules))).toHaveLength(3)
  })
  it('flips a direction', () => expect(toggleRule(rules, 0)[0]).toEqual({ f: 'total', d: 'asc' }))
  it('moves a rule earlier or later, and not past either end', () => {
    expect(moveRule(rules, 1, -1).map((r) => r.f)).toEqual(['age', 'total'])
    expect(moveRule(rules, 0, -1)).toEqual(rules)
    expect(moveRule(rules, 1, 1)).toEqual(rules)
  })
  it('removes a rule', () => expect(removeRule(rules, 0)).toEqual([{ f: 'age', d: 'asc' }]))
  it('swaps when a field already used is chosen', () => {
    expect(setRuleField(rules, 0, 'age')).toEqual([{ f: 'age', d: 'desc' }, { f: 'total', d: 'asc' }])
  })
  it('describes the order in words', () => {
    expect(describeSort(rules)).toBe('Total score high to low, then Age low to high')
    expect(describeSort([])).toBe('Newest first')
  })
})

describe('navigation', () => {
  it('opens the page in the address and moves between pages without reloading', async () => {
    render(<AdminApp />)
    expect(await screen.findByText('1 submissions')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Submissions' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('link', { name: 'Ranking simulator' }))
    expect(window.location.pathname).toBe('/admin/simulator')
    expect(screen.getByRole('button', { name: 'Show ranking' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Overview' }))
    expect(window.location.pathname).toBe('/admin')
  })

  it('keeps the filters when switching away and back', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('link', { name: 'Overview' }))
    fireEvent.click(screen.getByRole('link', { name: 'Submissions' }))
    expect((screen.getByLabelText('Age minimum') as HTMLInputElement).value).toBe('30')
  })

  it('shows nothing from any page until signed in', () => {
    localStorage.clear()
    render(<AdminApp />)
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(types.loadSubmissions).not.toHaveBeenCalled()
  })
})

describe('submissions page', () => {
  it('loads the newest-first by score list on open', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    expect(lastQuery()).toEqual({ filters: {}, sort: [{ f: 'total', d: 'desc' }], limit: 50, offset: 0 })
    expect(screen.getByText('Software Engineer')).toBeTruthy()
    expect(within(screen.getByRole('table')).getByText('4 to 5 years')).toBeTruthy()
    expect(screen.getByText('$95,000')).toBeTruthy()
  })

  it('applies every filter together', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Age maximum'), { target: { value: '35' } })
    fireEvent.change(screen.getByLabelText('Total score minimum'), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText('Total score maximum'), { target: { value: '700' } })
    fireEvent.change(screen.getByLabelText('Income (AUD a year) minimum'), { target: { value: '80000' } })
    fireEvent.change(screen.getByLabelText('Occupation'), { target: { value: 'engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Superior' }))
    fireEvent.click(screen.getByRole('button', { name: "Master's" }))
    fireEvent.click(screen.getByRole('button', { name: '4 to 5 years' }))
    fireEvent.click(screen.getByRole('button', { name: 'Onshore' }))
    fireEvent.click(screen.getByRole('button', { name: 'Has the bonus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await vi.waitFor(() => expect(lastQuery().filters).toMatchObject({ ageMin: 25 }))
    expect(lastQuery().filters).toEqual({
      ageMin: 25, ageMax: 35, scoreMin: 600, scoreMax: 700, incomeMin: 80000, occupation: 'engineer',
      english: ['superior'], education: ['masters'], experience: ['4'], location: ['onshore'], partner: 'yes',
    })
    expect(lastQuery().offset).toBe(0)
  })

  it('does not search until Apply is pressed', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    const calls = vi.mocked(types.loadSubmissions).mock.calls.length
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '25' } })
    expect(vi.mocked(types.loadSubmissions).mock.calls.length).toBe(calls)
  })

  it('resets the filters', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await vi.waitFor(() => expect(lastQuery().filters).toEqual({ ageMin: 25 }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await vi.waitFor(() => expect(lastQuery().filters).toEqual({}))
    expect((screen.getByLabelText('Age minimum') as HTMLInputElement).value).toBe('')
  })

  it('sorts by several factors in the order chosen', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    fireEvent.click(screen.getByRole('button', { name: 'Add a sort rule' }))
    await vi.waitFor(() => expect(lastQuery().sort).toEqual([{ f: 'total', d: 'desc' }, { f: 'age', d: 'desc' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Rule 2 direction' }))
    await vi.waitFor(() => expect(lastQuery().sort[1]).toEqual({ f: 'age', d: 'asc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a sort rule' }))
    await vi.waitFor(() => expect(lastQuery().sort).toHaveLength(3))
    expect((screen.getByRole('button', { name: 'Add a sort rule' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Move rule 3 up' }))
    await vi.waitFor(() => expect(lastQuery().sort.map((r) => r.f)).toEqual(['total', 'income', 'age']))
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }))
    await vi.waitFor(() => expect(lastQuery().sort.map((r) => r.f)).toEqual(['income', 'age']))
  })

  it('pages through the results', async () => {
    vi.mocked(types.loadSubmissions).mockResolvedValue({ status: 'ok', data: { total: 120, rows: [row()] } })
    render(<AdminApp />)
    await screen.findByText('120 submissions')
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await vi.waitFor(() => expect(lastQuery().offset).toBe(50))
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await vi.waitFor(() => expect(lastQuery().offset).toBe(100))
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true))
  })

  it('says when nothing matches', async () => {
    vi.mocked(types.loadSubmissions).mockResolvedValue({ status: 'ok', data: { total: 0, rows: [] } })
    render(<AdminApp />)
    expect(await screen.findByText('No submissions match these filters.')).toBeTruthy()
  })

  it('opens a row to show its sections and a link to the public result', async () => {
    render(<AdminApp />)
    fireEvent.click(await screen.findByText('Software Engineer'))
    expect(screen.getByText('Open the public result page').getAttribute('href')).toBe('/r/2ceb142f-cccc-4081-834a-133f83343775')
    expect(screen.getByText('Skill level')).toBeTruthy()
  })

  it('returns to sign-in when the session expired', async () => {
    vi.mocked(types.loadSubmissions).mockResolvedValue({ status: 'signed_out' })
    render(<AdminApp />)
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
  })

  it('reports a refused account', async () => {
    vi.mocked(types.loadSubmissions).mockResolvedValue({ status: 'forbidden' })
    render(<AdminApp />)
    expect((await screen.findByRole('alert')).textContent).toContain('does not have access')
  })
})

describe('deleting a submission', () => {
  const openRow = async () => {
    render(<AdminApp />)
    fireEvent.click(await screen.findByText('Software Engineer'))
  }

  it('asks first, and does nothing if cancelled', async () => {
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('This cannot be undone')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(types.deleteSubmission).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('deletes after confirmation and reloads the list', async () => {
    await openRow()
    const loads = vi.mocked(types.loadSubmissions).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await vi.waitFor(() => expect(types.deleteSubmission).toHaveBeenCalledWith('tok', '2ceb142f-cccc-4081-834a-133f83343775'))
    await vi.waitFor(() => expect(vi.mocked(types.loadSubmissions).mock.calls.length).toBe(loads + 1))
  })

  it('reloads when the row was already gone', async () => {
    vi.mocked(types.deleteSubmission).mockResolvedValue({ status: 'not_found' })
    await openRow()
    const loads = vi.mocked(types.loadSubmissions).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await vi.waitFor(() => expect(vi.mocked(types.loadSubmissions).mock.calls.length).toBe(loads + 1))
  })

  it('reports a failure and keeps the confirmation open', async () => {
    vi.mocked(types.deleteSubmission).mockResolvedValue({ status: 'error' })
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load')
  })

  it('returns to sign-in when the session expired', async () => {
    vi.mocked(types.deleteSubmission).mockResolvedValue({ status: 'signed_out' })
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
  })
})

describe('editing a submission', () => {
  const openEditor = async () => {
    render(<AdminApp />)
    fireEvent.click(await screen.findByText('Software Engineer'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    return within(screen.getByRole('dialog'))
  }
  const savedPayload = () => vi.mocked(types.updateSubmission).mock.calls[0]

  it('opens with the saved answers', async () => {
    const dialog = await openEditor()
    expect((dialog.getByLabelText('Age') as HTMLInputElement).value).toBe('31')
    expect((dialog.getByLabelText('English level') as HTMLSelectElement).value).toBe('superior')
    expect((dialog.getByLabelText('Education') as HTMLSelectElement).value).toBe('masters')
    expect((dialog.getByLabelText('Experience') as HTMLSelectElement).value).toBe('4')
    expect((dialog.getByLabelText('Partner bonus') as HTMLSelectElement).value).toBe('yes')
    expect((dialog.getByLabelText('Annual earnings (AUD)') as HTMLInputElement).value).toBe('95000')
    expect(dialog.getByText(/Software Engineer \(261313\)/)).toBeTruthy()
  })

  it('shows the new score as the answers change', async () => {
    const real = calculateVpt({
      location: 'onshore', age: 31, english: 'superior', experienceYears: 5, education: 'masters',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 95000,
    }).total
    vi.mocked(types.loadSubmissions).mockResolvedValue({ status: 'ok', data: { total: 1, rows: [row({ total: real })] } })
    const dialog = await openEditor()
    expect(dialog.queryByText(/becomes/)).toBeNull()
    fireEvent.change(dialog.getByLabelText('English level'), { target: { value: 'competent' } })
    expect(dialog.getByText(/becomes/).textContent).toContain(String(real - 200))
  })

  it('saves the changed answers, keeping the occupation and the saved years of experience', async () => {
    const dialog = await openEditor()
    fireEvent.change(dialog.getByLabelText('Age'), { target: { value: '33' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(types.updateSubmission).toHaveBeenCalled())
    const [token, id, input, occupation] = savedPayload()
    expect(token).toBe('tok')
    expect(id).toBe('2ceb142f-cccc-4081-834a-133f83343775')
    // The row stored 5 years, which sits in the 4 to 5 band. Leaving the band alone keeps the 5.
    expect(input).toEqual({
      location: 'onshore', age: 33, english: 'superior', experienceYears: 5, education: 'masters',
      skillLevel: 1, partnerQualifies: true, annualEarnings: 95000,
    })
    expect(occupation).toBeUndefined()
  })

  it('stores the band code when the band is changed', async () => {
    const dialog = await openEditor()
    fireEvent.change(dialog.getByLabelText('Experience'), { target: { value: '9' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(types.updateSubmission).toHaveBeenCalled())
    expect(savedPayload()[2]).toMatchObject({ experienceYears: 9 })
  })

  it('removes the occupation, and can undo that', async () => {
    const dialog = await openEditor()
    fireEvent.click(dialog.getByRole('button', { name: 'Remove' }))
    expect(dialog.getByText('The occupation will be removed.')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Undo' }))
    expect(dialog.getByText(/Software Engineer \(261313\)/)).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Remove' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(types.updateSubmission).toHaveBeenCalled())
    expect(savedPayload()[3]).toBeNull()
  })

  it('changes the occupation to a listed one', async () => {
    const dialog = await openEditor()
    fireEvent.click(dialog.getByRole('button', { name: 'Change' }))
    fireEvent.click(dialog.getByText('pick occupation'))
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(types.updateSubmission).toHaveBeenCalled())
    expect(savedPayload()[3]).toBe('261313')
  })

  it('closes and reloads the list after saving', async () => {
    const dialog = await openEditor()
    const loads = vi.mocked(types.loadSubmissions).mock.calls.length
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await vi.waitFor(() => expect(vi.mocked(types.loadSubmissions).mock.calls.length).toBe(loads + 1))
  })

  it('will not save answers that are out of range', async () => {
    const dialog = await openEditor()
    fireEvent.change(dialog.getByLabelText('Age'), { target: { value: '200' } })
    expect(dialog.getByText('Check the answers.')).toBeTruthy()
    expect((dialog.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)
    expect(types.updateSubmission).not.toHaveBeenCalled()
  })

  it('shows the server rejecting impossible answers, and keeps the form open', async () => {
    vi.mocked(types.updateSubmission).mockResolvedValue({ status: 'implausible' })
    const dialog = await openEditor()
    fireEvent.change(dialog.getByLabelText('Age'), { target: { value: '19' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    expect((await dialog.findByRole('alert')).textContent).toContain('do not look possible')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('cancels without saving', async () => {
    const dialog = await openEditor()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(types.updateSubmission).not.toHaveBeenCalled()
  })
})

describe('submissions page on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 639px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('folds the filters and sort rules away and shows the results first', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    expect(screen.getByRole('button', { name: /Filters and sort/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Age minimum')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a sort rule' })).toBeNull()
  })

  it('shows each submission as a card, not a table', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('Software Engineer')).toBeTruthy()
    expect(screen.getByText('$95,000')).toBeTruthy()
    expect(screen.getByText('Partner bonus')).toBeTruthy()
  })

  it('opens a card for its section points and the public result link', async () => {
    render(<AdminApp />)
    fireEvent.click(await screen.findByText('Software Engineer'))
    expect(screen.getByText('Open the public result page').getAttribute('href')).toContain('/r/')
    expect(screen.getByText('Skill level')).toBeTruthy()
  })

  it('opens the panel, applies filters and folds it away again', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    fireEvent.click(screen.getByRole('button', { name: /Filters and sort/ }))
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '30' } })
    expect(screen.getByRole('button', { name: 'Add a sort rule' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await vi.waitFor(() => expect(lastQuery().filters).toEqual({ ageMin: 30 }))
    expect(screen.queryByLabelText('Age minimum')).toBeNull()
    expect(screen.getByRole('button', { name: /Filters and sort/ }).textContent).toContain('1 active')
  })

  it('keeps the typed filters while the panel is folded', async () => {
    render(<AdminApp />)
    await screen.findByText('1 submissions')
    const toggle = () => screen.getByRole('button', { name: /Filters and sort/ })
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('Age minimum'), { target: { value: '30' } })
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect((screen.getByLabelText('Age minimum') as HTMLInputElement).value).toBe('30')
  })
})

describe('ranking simulator', () => {
  const open = async () => {
    window.history.replaceState(null, '', '/admin/simulator')
    render(<AdminApp />)
    await screen.findByRole('button', { name: 'Show ranking' })
  }

  it('ranks a single score with the public comparison', async () => {
    vi.mocked(types.simulateRanking).mockResolvedValue({ status: 'ok', data: { insights: ranked } })
    await open()
    fireEvent.change(screen.getByLabelText(/Total score/), { target: { value: '640' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show ranking' }))
    expect(await screen.findByText('Where you rank')).toBeTruthy()
    expect(types.simulateRanking).toHaveBeenCalledWith('tok', { mode: 'score', total: 640, location: 'onshore', occupationCode: undefined })
    expect(screen.getByText('Simulated score')).toBeTruthy()
    expect(screen.getByText(/no section breakdown/)).toBeTruthy()
    expect(screen.queryByText('Your score breakdown')).toBeNull()
  })

  it('rejects a score outside 0 to 950 without asking the server', async () => {
    await open()
    fireEvent.change(screen.getByLabelText(/Total score/), { target: { value: '951' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show ranking' }))
    expect((await screen.findByRole('alert')).textContent).toContain('0 to 950')
    expect(types.simulateRanking).not.toHaveBeenCalled()
  })

  it('scores the full form on the server rules and shows the section charts', async () => {
    vi.mocked(types.simulateRanking).mockResolvedValue({ status: 'ok', data: { insights: ranked } })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'The full form' }))
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('English level'), { target: { value: 'superior' } })
    fireEvent.change(screen.getByLabelText('Experience'), { target: { value: '9' } })
    fireEvent.click(screen.getByText('pick occupation'))
    fireEvent.click(screen.getByRole('button', { name: 'Show ranking' }))
    expect(await screen.findByText('Your score breakdown')).toBeTruthy()
    const [, request] = vi.mocked(types.simulateRanking).mock.calls[0]
    expect(request).toMatchObject({
      mode: 'form', occupationCode: '261313',
      input: { age: 30, english: 'superior', experienceYears: 9, education: 'bachelors', location: 'onshore', annualEarnings: 0 },
    })
    // Age 30 (286) + superior (200) + 9 years (100) + bachelor's (50) + skill 1 (50).
    expect(screen.getByText('686')).toBeTruthy()
  })

  it('explains when too few submissions are stored to compare', async () => {
    vi.mocked(types.simulateRanking).mockResolvedValue({ status: 'ok', data: { insights: { ...ranked, overall: { n: 4 } } } })
    await open()
    fireEvent.change(screen.getByLabelText(/Total score/), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show ranking' }))
    expect(await screen.findByText(/Fewer than 10 submissions/)).toBeTruthy()
  })

  it('clears the result', async () => {
    vi.mocked(types.simulateRanking).mockResolvedValue({ status: 'ok', data: { insights: ranked } })
    await open()
    fireEvent.change(screen.getByLabelText(/Total score/), { target: { value: '640' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show ranking' }))
    await screen.findByText('Where you rank')
    fireEvent.click(screen.getByRole('button', { name: 'Clear result' }))
    expect(screen.queryByText('Where you rank')).toBeNull()
  })
})

describe('submissions over time', () => {
  const openOverview = async () => {
    window.history.replaceState(null, '', '/admin')
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'error' })
    render(<AdminApp />)
  }

  it('is not shown when the overview failed to load', async () => {
    await openOverview()
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load')
  })

  it('labels bars by their width', () => {
    expect(barLabel('2026-10-16T14:05', 60)).toBe('14:05')
    expect(barLabel('2026-10-16T14:00', 3600)).toBe('Fri, 16 Oct 14:00-15:00')
    expect(barLabel('2026-10-16T20:00', 14400)).toBe('Fri, 16 Oct 20:00-00:00')
    expect(barLabel('2026-10-16T00:00', 86400)).toBe('Fri, 16 Oct')
  })
})
