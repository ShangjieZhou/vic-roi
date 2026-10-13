// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Insights } from '../supabase/functions/_shared/insights'
import { App } from './App'
import * as api from './api'
import { LangProvider } from './i18n'
import { addToHistory, loadHistory, type HistoryEntry } from './saved'

vi.mock('./api', () => ({
  submitScore: vi.fn(),
  loadSubmission: vi.fn(),
  suggestOccupations: vi.fn(async () => []),
}))

const ID = '2ceb142f-cccc-4081-834a-133f83343775'
const INPUT = {
  location: 'onshore' as const, age: 30, english: 'proficient' as const, experienceYears: 4, education: 'bachelors' as const,
  skillLevel: 1 as const, partnerQualifies: false, annualEarnings: 0,
}
const waiting = (n: number): Insights => ({ total: 546, location: 'onshore', overall: { n }, occupation: null })
const ranked: Insights = {
  total: 546, location: 'onshore',
  overall: { n: 12, percentile: 55, median: 520, p25: 450, p75: 600, histogram: [{ from: 500, count: 4 }], categoryAvg: { age: 250 } },
  occupation: null,
}
const withPercentiles: Insights = {
  ...ranked,
  overall: {
    ...ranked.overall,
    categoryAvg: { age: 250, english: 90, experience: 45, education: 60, skillLevel: 37, partner: 3, earnings: 53 },
    categoryPercentile: { age: 78, english: 21, experience: 40, education: 33, skillLevel: 63, partner: 47, earnings: 87 },
  },
}
const submission = (insights: Insights) => ({ id: ID, occupation: null, insights })

const renderApp = () => render(<LangProvider><App /></LangProvider>)
const pick = (label: string) => fireEvent.click(screen.getByText(label))
const type = (title: string, value: string) => {
  fireEvent.change(screen.getByLabelText(title), { target: { value } })
  fireEvent.submit(screen.getByLabelText(title).closest('form')!)
}

function submitFromScratch() {
  renderApp()
  type('How old are you?', '30')
  pick('Proficient')
  pick('3 to 5 years')
  pick("Bachelor's or Honours")
  pick('Skill level 1')
  pick('You are single, have an Australian partner, or do not meet the requirements above')
  type('What is your annual earnings from current skilled employment in Victoria?', '0')
  fireEvent.click(screen.getByText('Submit anonymously and see my insights'))
}

beforeEach(() => {
  vi.mocked(api.submitScore).mockReset()
  vi.mocked(api.loadSubmission).mockReset()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = 'en'
})

describe('submitting while the pool is too small', () => {
  it('explains the wait, offers to come back later, and remembers the result on this device', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })
    submitFromScratch()

    await screen.findByText('Your score is saved')
    expect(screen.getByText('Comparisons unlock once 10 onshore candidates have submitted. So far 3 have, including you.')).toBeTruthy()
    expect(
      screen.getByText(
        'You can stay on this page, or come back to this link later and refresh to see your analysis once enough candidates have submitted.',
      ),
    ).toBeTruthy()
    expect(screen.getByText(/listed under Your submissions/)).toBeTruthy()
    expect(screen.getByText('Your submission is anonymous, so there is nothing to worry about while you wait.')).toBeTruthy()
    // The old bare "not enough data" panel is gone, and no ranking is shown.
    expect(screen.queryByText('Not enough data yet')).toBeNull()
    expect(screen.queryByText('Where you sit in the pool')).toBeNull()

    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(loadHistory()).toEqual([
      expect.objectContaining({ id: ID, total: 546, location: 'onshore', occupation: null }),
    ])
  })

  it('"Check again" says still waiting, then reveals the analysis once the pool is big enough', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(4)) })
    submitFromScratch()
    await screen.findByText('Your score is saved')

    vi.mocked(api.loadSubmission).mockResolvedValueOnce({ input: INPUT, submission: submission(waiting(6)) })
    fireEvent.click(screen.getByText('Check again'))
    await screen.findByText('Still waiting for more candidates. Check again later.')
    expect(screen.getByText(/So far 6 have/)).toBeTruthy()

    vi.mocked(api.loadSubmission).mockResolvedValueOnce({ input: INPUT, submission: submission(ranked) })
    fireEvent.click(screen.getByText('Check again'))
    await screen.findByText('Mid-range')
    expect(screen.queryByText('Your score is saved')).toBeNull()
    expect(screen.getByText('Where you sit in the pool')).toBeTruthy()
  })

  it('shows the waiting message in Chinese', async () => {
    localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    type('您目前在维多利亚州技术岗位的年收入是多少？', '0')
    fireEvent.click(screen.getByText('匿名提交，查看我的分析'))
    await screen.findByText('您的分数已保存')
    expect(screen.getByText('当 10 位境内候选人提交后即可开始对比。目前已有 3 位（包括您）。')).toBeTruthy()
    expect(screen.getByText('您的提交是匿名的，等待期间无需担心隐私。')).toBeTruthy()
    expect(screen.getByText('再次查看')).toBeTruthy()
  })
})

const ID2 = '9a1b2c3d-1111-4222-8333-444455556666'
const entry = (id: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id, total: 546, location: 'onshore', occupation: null, savedAt: Date.now() - 3 * 86_400_000, ...over,
})

// Result rows only. The footer also has a link.
const rowLinks = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/r/'))

describe('submission history', () => {
  it('lists earlier submissions on the home screen with score, group, occupation and age', () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    addToHistory(entry(ID2, { total: 810, location: 'offshore', savedAt: Date.now() - 60_000 }))
    renderApp()
    expect(screen.getByText('Your submissions')).toBeTruthy()
    expect(screen.getByText('546 points')).toBeTruthy()
    expect(screen.getByText('810 points')).toBeTruthy()
    expect(screen.getByText('onshore · Registered Nurse')).toBeTruthy()
    expect(screen.getByText('offshore · No occupation given')).toBeTruthy()
    expect(screen.getByText(/3 days ago/)).toBeTruthy()
    // Newest first.
    const rows = rowLinks()
    expect(rows[0].getAttribute('href')).toBe(`/r/${ID2}`)
    expect(rows[1].getAttribute('href')).toBe(`/r/${ID}`)
    // The wizard is still available below the list.
    expect(screen.getByText('How old are you?')).toBeTruthy()
  })

  it('stresses that every submission is anonymous', () => {
    addToHistory(entry(ID))
    renderApp()
    expect(screen.getByText('Free to use, with no sign-up. Submitting your score is anonymous.')).toBeTruthy()
    expect(screen.getByText(/Every submission is anonymous: no name or email is attached/)).toBeTruthy()
  })

  it('shows nothing extra for a first-time visitor', () => {
    renderApp()
    expect(screen.queryByText('Your submissions')).toBeNull()
    expect(screen.getByText('Free to use, with no sign-up. Submitting your score is anonymous.')).toBeTruthy()
  })

  it('opens a past submission with its full analysis, like right after submitting', async () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Mid-range')
    expect(screen.getByText('Where you sit in the pool')).toBeTruthy()
    expect(api.loadSubmission).toHaveBeenCalledWith(ID)
    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(screen.getByText('‹ My submissions')).toBeTruthy()
  })

  it('opens a past submission that is still waiting for enough candidates', async () => {
    addToHistory(entry(ID))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(5)) })
    renderApp()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.getByText('Check again')).toBeTruthy()
  })

  it('returns to the list from a result, and the browser Back button does too', async () => {
    addToHistory(entry(ID))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Mid-range')

    fireEvent.click(screen.getByText('‹ My submissions'))
    expect(await screen.findByText('Your submissions')).toBeTruthy()
    expect(window.location.pathname).toBe('/')

    // Forward to the result again, then Back.
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Mid-range')
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByText('Your submissions')).toBeTruthy()
    expect(screen.queryByText('Mid-range')).toBeNull()
  })

  it('adds each new submission to the list, newest first, without duplicates', async () => {
    addToHistory(entry(ID2, { total: 700, savedAt: Date.now() - 86_400_000 }))
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })
    submitFromScratch()
    await screen.findByText('Your score is saved')
    expect(loadHistory().map((e) => e.id)).toEqual([ID, ID2])
  })

  it('clears the list on this device only', () => {
    addToHistory(entry(ID))
    renderApp()
    expect(screen.getByText('This only removes the list from this device.')).toBeTruthy()
    fireEvent.click(screen.getByText('Clear this list'))
    expect(screen.queryByText('Your submissions')).toBeNull()
    expect(loadHistory()).toEqual([])
  })

  it('collapses a long list to three entries and expands on request', () => {
    for (let n = 0; n < 5; n++) {
      addToHistory(entry(`9a1b2c3d-1111-4222-8333-44445555000${n}`, { total: 600 + n, savedAt: Date.now() - n * 1000 }))
    }
    renderApp()
    expect(rowLinks()).toHaveLength(3)
    fireEvent.click(screen.getByText('Show all 5'))
    expect(rowLinks()).toHaveLength(5)
    fireEvent.click(screen.getByText('Show fewer'))
    expect(rowLinks()).toHaveLength(3)
  })

  it('shows the history in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    addToHistory(entry(ID, { occupation: '护士' }))
    renderApp()
    expect(screen.getByText('您的提交记录')).toBeTruthy()
    expect(screen.getByText('546 分')).toBeTruthy()
    expect(screen.getByText('境内 · 护士')).toBeTruthy()
    expect(screen.getByText('免费使用，无需注册。提交分数是匿名的。')).toBeTruthy()
  })
})

describe('opening a result link', () => {
  it('reopens a saved result from its link with fresh analysis', async () => {
    window.history.replaceState(null, '', `/r/${ID}`)
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    await screen.findByText('Mid-range')
    expect(api.loadSubmission).toHaveBeenCalledWith(ID)
  })

  it('drops a result from the list when the server no longer has it', async () => {
    addToHistory(entry(ID))
    addToHistory(entry(ID2, { savedAt: Date.now() - 1000 }))
    window.history.replaceState(null, '', `/r/${ID}`)
    vi.mocked(api.loadSubmission).mockResolvedValue('not_found')
    renderApp()
    await waitFor(() => expect(loadHistory().map((e) => e.id)).toEqual([ID2]))
    expect(window.location.pathname).toBe('/')
  })

  it('keeps the list when the server is only unreachable', async () => {
    addToHistory(entry(ID))
    window.history.replaceState(null, '', `/r/${ID}`)
    vi.mocked(api.loadSubmission).mockResolvedValue(null)
    renderApp()
    await screen.findByText('How old are you?')
    expect(loadHistory().map((e) => e.id)).toEqual([ID])
  })
})

describe('section percentiles', () => {
  const open = async () => {
    addToHistory(entry(ID))
    renderApp()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Mid-range')
  }

  it('shows a percentile under every section of the comparison', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(withPercentiles) })
    await open()
    expect(screen.getByText('You compared with the average')).toBeTruthy()
    for (const text of ['78th percentile', '21st percentile', '40th percentile', '33rd percentile', '63rd percentile', '47th percentile', '87th percentile']) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
  })

  it('explains how percentiles treat ties', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(withPercentiles) })
    await open()
    expect(screen.getByText(/Percentile is the share of candidates who scored lower than you, plus half of those who tied/)).toBeTruthy()
  })

  it('shows no percentile lines when the server did not send them', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    await open()
    expect(screen.getByText('You compared with the average')).toBeTruthy()
    expect(screen.queryByText(/percentile$/)).toBeNull()
    expect(screen.queryByText(/Percentile is the share/)).toBeNull()
  })

  it('shows them in Chinese', async () => {
    localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(withPercentiles) })
    addToHistory(entry(ID))
    renderApp()
    fireEvent.click(screen.getByText('546 分'))
    await screen.findByText('中等')
    expect(screen.getByText('第 78 百分位')).toBeTruthy()
    expect(screen.getByText('第 21 百分位')).toBeTruthy()
    expect(screen.getByText(/百分位 = 得分低于您的候选人比例/)).toBeTruthy()
  })

  it('does not show them while the pool is too small, since there is no comparison yet', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(4)) })
    addToHistory(entry(ID))
    renderApp()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.queryByText(/percentile/)).toBeNull()
  })
})
