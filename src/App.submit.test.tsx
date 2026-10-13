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
}))

const ID = '2ceb142f-cccc-4081-834a-133f83343775'
const ID2 = '9a1b2c3d-1111-4222-8333-444455556666'
const CTA = 'Submit and compare my score against others'
const CTA_ZH = '提交并与其他候选人对比我的分数'

const INPUT = {
  location: 'onshore' as const, age: 30, english: 'proficient' as const, experienceYears: 4, education: 'bachelors' as const,
  skillLevel: 1 as const, partnerQualifies: false, annualEarnings: 0,
}
const waiting = (n: number): Insights => ({ total: 546, location: 'onshore', overall: { n }, occupation: null })
const ranked: Insights = {
  total: 546, location: 'onshore',
  overall: { n: 12, percentile: 55, median: 520, mean: 530, meanPercentile: 52 },
  occupation: null,
}
// Values chosen so this candidate's own scores (286, 100, 60, 50, 50, 0, 0) appear in every chart.
const withCharts: Insights = {
  ...ranked,
  overall: {
    ...ranked.overall,
    categoryAvg: { age: 268, english: 90, experience: 45, education: 60, skillLevel: 37, partner: 3, earnings: 53 },
    categoryPercentile: { age: 78, english: 21, experience: 40, education: 33, skillLevel: 63, partner: 47, earnings: 87 },
    categoryDist: {
      age: [{ points: 286, count: 4 }, { points: 300, count: 8 }],
      english: [{ points: 0, count: 5 }, { points: 100, count: 4 }, { points: 200, count: 3 }],
      experience: [{ points: 40, count: 3 }, { points: 60, count: 6 }, { points: 100, count: 3 }],
      education: [{ points: 50, count: 7 }, { points: 75, count: 5 }],
      skillLevel: [{ points: 0, count: 2 }, { points: 50, count: 10 }],
      partner: [{ points: 0, count: 11 }, { points: 50, count: 1 }],
      earnings: [{ points: 0, count: 7 }, { points: 47, count: 2 }, { points: 103, count: 3 }],
    },
  },
}
const submission = (insights: Insights) => ({ id: ID, occupation: null, occupationCode: null, insights })

const renderApp = () => render(<LangProvider><App /></LangProvider>)
const pick = (label: string) => fireEvent.click(screen.getByText(label))
const type = (title: string, value: string) => {
  fireEvent.change(screen.getByLabelText(title), { target: { value } })
  fireEvent.submit(screen.getByLabelText(title).closest('form')!)
}

const entry = (id: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id, total: 546, location: 'onshore', occupation: null, occupationCode: null, savedAt: Date.now() - 3 * 86_400_000, ...over,
})

// The history is collapsed until its header is pressed.
const openHistory = (zh = false) =>
  fireEvent.click(screen.getByText(zh ? /^您的提交记录（\d+）$/ : /^Your submissions \(\d+\)$/))
// Result rows only. The footer also has a link.
const rowLinks = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/r/'))

function reachSubmitCard() {
  renderApp()
  type('How old are you?', '30')
  pick('Proficient')
  pick('3 to 5 years')
  pick("Bachelor's or Honours")
  pick('Skill level 1')
  pick('You are single, have an Australian partner, or do not meet the requirements above')
  type('What is your annual earnings from current skilled employment in Victoria?', '0')
}

function submitFromScratch() {
  reachSubmitCard()
  fireEvent.click(screen.getByText(CTA))
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

describe('submitting while fewer than 10 candidates have submitted overall', () => {
  it('explains the wait, offers to come back later, and remembers the result on this device', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })
    submitFromScratch()

    await screen.findByText('Your score is saved')
    expect(screen.getByText('Comparisons unlock once 10 candidates have submitted. So far 3 have, including you.')).toBeTruthy()
    expect(
      screen.getByText(
        'You can stay on this page, or come back to this link later and refresh to see your analysis once enough candidates have submitted.',
      ),
    ).toBeTruthy()
    expect(screen.getByText(/listed under Your submissions/)).toBeTruthy()
    expect(screen.getByText('Your submission is anonymous, so there is nothing to worry about while you wait.')).toBeTruthy()
    expect(screen.queryByText('Not enough data yet')).toBeNull()
    expect(screen.queryByText('Where you rank')).toBeNull()
    expect(screen.queryByText('Your percentile')).toBeNull()

    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(loadHistory()).toEqual([
      expect.objectContaining({ id: ID, total: 546, location: 'onshore', occupation: null, occupationCode: null }),
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
    await screen.findByText('Where you rank')
    expect(screen.queryByText('Your score is saved')).toBeNull()
    expect(screen.getByText('Among all 12 submitted candidates')).toBeTruthy()
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
    fireEvent.click(screen.getByText(CTA_ZH))
    await screen.findByText('您的分数已保存')
    expect(screen.getByText('当 10 位候选人提交后即可开始对比。目前已有 3 位（包括您）。')).toBeTruthy()
    expect(screen.getByText('您的提交是匿名的，等待期间无需担心隐私。')).toBeTruthy()
    expect(screen.getByText('再次查看')).toBeTruthy()
  })
})

describe('submission history', () => {
  it('sits below the question and starts collapsed, showing only how many submissions there are', () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    addToHistory(entry(ID2, { total: 810, location: 'offshore', savedAt: Date.now() - 60_000 }))
    renderApp()
    const header = screen.getByText('Your submissions (2)')
    const question = screen.getByText('How old are you?')
    // DOCUMENT_POSITION_FOLLOWING (4): the history comes after the question.
    expect(question.compareDocumentPosition(header) & 4).toBe(4)
    expect(screen.getByRole('button', { name: /Your submissions \(2\)/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('546 points')).toBeNull()
    expect(screen.queryByText('810 points')).toBeNull()
  })

  it('expands to list each submission with score, group, occupation and age, newest first', () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    addToHistory(entry(ID2, { total: 810, location: 'offshore', savedAt: Date.now() - 60_000 }))
    renderApp()
    openHistory()
    expect(screen.getByRole('button', { name: /Your submissions \(2\)/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('546 points')).toBeTruthy()
    expect(screen.getByText('810 points')).toBeTruthy()
    expect(screen.getByText('onshore · Registered Nurse')).toBeTruthy()
    expect(screen.getByText('offshore · No occupation given')).toBeTruthy()
    expect(screen.getByText(/3 days ago/)).toBeTruthy()
    const rows = rowLinks()
    expect(rows[0].getAttribute('href')).toBe(`/r/${ID2}`)
    expect(rows[1].getAttribute('href')).toBe(`/r/${ID}`)
    // The wizard stays available above the list.
    expect(screen.getByText('How old are you?')).toBeTruthy()
  })

  it('collapses again, and shows every entry when expanded', () => {
    for (let n = 0; n < 5; n++) {
      addToHistory(entry(`9a1b2c3d-1111-4222-8333-44445555000${n}`, { total: 600 + n, savedAt: Date.now() - n * 1000 }))
    }
    renderApp()
    openHistory()
    expect(rowLinks()).toHaveLength(5)
    openHistory()
    expect(screen.queryByText('600 points')).toBeNull()
    expect(screen.getByRole('button', { name: /Your submissions \(5\)/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('no longer opens the home screen with a privacy banner, and stresses anonymity inside the history', () => {
    addToHistory(entry(ID))
    renderApp()
    expect(screen.queryByText(/Free to use/)).toBeNull()
    openHistory()
    expect(screen.getByText(/Every submission is anonymous: no name or email is attached/)).toBeTruthy()
  })

  it('shows nothing extra for a first-time visitor', () => {
    renderApp()
    expect(screen.queryByText(/Your submissions/)).toBeNull()
    expect(screen.queryByText(/Free to use/)).toBeNull()
    expect(screen.getByText('How old are you?')).toBeTruthy()
  })

  it('opens a past submission with its full analysis, like right after submitting', async () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Where you rank')
    expect(screen.getByText('Your score in each section')).toBeTruthy()
    expect(api.loadSubmission).toHaveBeenCalledWith(ID)
    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(screen.getByText('‹ My submissions')).toBeTruthy()
  })

  it('opens a past submission that is still waiting for enough candidates', async () => {
    addToHistory(entry(ID))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(5)) })
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.getByText('Check again')).toBeTruthy()
  })

  it('returns to the list from a result, and the browser Back button does too', async () => {
    addToHistory(entry(ID))
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Where you rank')

    fireEvent.click(screen.getByText('‹ My submissions'))
    expect(await screen.findByText('Your submissions (1)')).toBeTruthy()
    expect(window.location.pathname).toBe('/')

    // Forward to the result again, then Back.
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Where you rank')
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByText('Your submissions (1)')).toBeTruthy()
    expect(screen.queryByText('Where you rank')).toBeNull()
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
    openHistory()
    expect(screen.getByText('This only removes the list from this device.')).toBeTruthy()
    fireEvent.click(screen.getByText('Clear this list'))
    expect(screen.queryByText(/Your submissions/)).toBeNull()
    expect(loadHistory()).toEqual([])
  })

  it('shows the history in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    addToHistory(entry(ID, { occupation: '护士' }))
    renderApp()
    expect(screen.getByText('您的提交记录（1）')).toBeTruthy()
    openHistory(true)
    expect(screen.getByText('546 分')).toBeTruthy()
    expect(screen.getByText('境内 · 护士')).toBeTruthy()
  })

  it('hides the history after the first step', () => {
    addToHistory(entry(ID))
    renderApp()
    type('How old are you?', '30')
    expect(screen.queryByText(/Your submissions/)).toBeNull()
  })
})

describe('opening a result link', () => {
  it('reopens a saved result from its link with fresh analysis', async () => {
    window.history.replaceState(null, '', `/r/${ID}`)
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(ranked) })
    renderApp()
    await screen.findByText('Where you rank')
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

describe('the analysis page', () => {
  const open = async (insights: Insights, lang: 'en' | 'zh' = 'en') => {
    if (lang === 'zh') localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(insights) })
    addToHistory(entry(ID))
    renderApp()
    openHistory(lang === 'zh')
    fireEvent.click(screen.getByText(lang === 'zh' ? '546 分' : '546 points'))
    await screen.findByText(lang === 'zh' ? '您的位置' : 'Where you rank')
  }

  it('no longer shows the assessment, the ways to add points, the histogram or the average bars', async () => {
    await open(withCharts)
    for (const gone of [
      'Your competitiveness', 'Mid-range', 'Strong', 'Below average',
      'Quickest ways to add points',
      'Where you sit in the pool', 'You compared with the average',
    ]) {
      expect(screen.queryByText(gone), gone).toBeNull()
    }
  })

  describe('percentile bar', () => {
    it('ranks the candidate among everyone and shows the median and the average', async () => {
      await open(withCharts)
      expect(screen.getByText('Among all 12 submitted candidates')).toBeTruthy()
      expect(screen.getAllByText('You: 55th percentile').length).toBeGreaterThan(0)
      expect(screen.getByText('Your score').nextSibling?.textContent).toBe('546')
      expect(screen.getByText('Median').nextSibling?.textContent).toBe('520')
      expect(screen.getByText('Average').nextSibling?.textContent).toBe('530')
      expect(screen.getByText('Lowest')).toBeTruthy()
      expect(screen.getByText('Highest')).toBeTruthy()
    })

    it('places the candidate at their percentile, the median at 50 and the average at its own percentile', async () => {
      await open(withCharts)
      const bar = screen.getByRole('img', { name: 'You: 55th percentile' })
      const at = (pct: number) => bar.querySelector(`[style*="left: ${pct}%"]`)
      expect(at(55)).toBeTruthy() // the candidate
      expect(at(50)).toBeTruthy() // the median, by definition
      expect(at(52)).toBeTruthy() // the average
    })

    it('copes with a server that does not send the average', async () => {
      await open({ ...withCharts, overall: { ...withCharts.overall, mean: undefined, meanPercentile: undefined } })
      expect(screen.getByText('Average').nextSibling?.textContent).toBe('-')
    })

    it('is shown in Chinese', async () => {
      await open(withCharts, 'zh')
      expect(screen.getByText('在全部 12 位已提交的候选人中')).toBeTruthy()
      expect(screen.getAllByText('您：第 55 百分位').length).toBeGreaterThan(0)
      expect(screen.getByText('您的分数')).toBeTruthy()
      expect(screen.getByText('中位数')).toBeTruthy()
      expect(screen.getByText('平均分')).toBeTruthy()
    })
  })

  describe('section bar charts', () => {
    it('draws one bar chart per section, with a bar for each score', async () => {
      await open(withCharts)
      expect(screen.getByText('Your score in each section')).toBeTruthy()
      expect(screen.getByText('Bars show how many candidates scored each value. Your score is highlighted.')).toBeTruthy()
      for (const label of [
        'Age', 'English language', 'Experience in nominated occupation', 'Education',
        'Occupation skill level', "Partner's skill", 'Victorian skilled earnings',
      ]) {
        expect(screen.getByText(label), label).toBeTruthy()
      }
      // One bar per distinct score: 2 + 3 + 3 + 2 + 2 + 2 + 3.
      expect(screen.getAllByTitle(/ at \d+ points$/)).toHaveLength(17)
    })

    it('highlights the candidate\'s own score and shows how many candidates got each score', async () => {
      await open(withCharts)
      const mine = screen.getByTitle('4 candidates at 286 points')
      expect(mine.className).toContain('bg-accent')
      expect(screen.getByTitle('8 candidates at 300 points').className).toContain('bg-stone-300')
      expect(screen.getByTitle('1 candidate at 50 points').className).toContain('bg-stone-300') // partner, not theirs
      expect(screen.getByTitle('11 candidates at 0 points').className).toContain('bg-accent') // partner: theirs is 0
    })

    it('scales each bar to its count', async () => {
      await open(withCharts)
      expect(screen.getByTitle('8 candidates at 300 points').getAttribute('style')).toContain('height: 100%')
      expect(screen.getByTitle('4 candidates at 286 points').getAttribute('style')).toContain('height: 50%')
    })

    it('shows the percentile and the average under each section', async () => {
      await open(withCharts)
      for (const text of [
        '78th percentile · Average 268', '21st percentile · Average 90', '40th percentile · Average 45',
        '33rd percentile · Average 60', '63rd percentile · Average 37', '47th percentile · Average 3',
        '87th percentile · Average 53',
      ]) {
        expect(screen.getByText(text), text).toBeTruthy()
      }
    })

    it('explains how percentiles treat ties', async () => {
      await open(withCharts)
      expect(screen.getByText(/Percentile is the share of candidates who scored lower than you, plus half of those who tied/)).toBeTruthy()
    })

    it('scores an offshore candidate 0 income points, on the same chart as everyone else', async () => {
      vi.mocked(api.loadSubmission).mockResolvedValue({
        input: { ...INPUT, location: 'offshore' },
        submission: submission({ ...withCharts, location: 'offshore' }),
      })
      addToHistory(entry(ID, { location: 'offshore' }))
      renderApp()
      openHistory()
      fireEvent.click(screen.getByText('546 points'))
      await screen.findByText('Where you rank')
      expect(screen.getByText('Victorian skilled earnings')).toBeTruthy()
      expect(screen.getByTitle('7 candidates at 0 points').className).toContain('bg-accent')
    })

    it('falls back to a plain bar when the server sends no distribution', async () => {
      await open(ranked)
      expect(screen.getByText('Your score in each section')).toBeTruthy()
      expect(screen.queryByTitle(/ at \d+ points$/)).toBeNull()
      expect(screen.queryByText(/percentile · Average/)).toBeNull()
      expect(screen.queryByText(/Percentile is the share/)).toBeNull()
    })

    it('is shown in Chinese', async () => {
      await open(withCharts, 'zh')
      expect(screen.getByText('各部分得分分布')).toBeTruthy()
      expect(screen.getByText('第 78 百分位 · 平均 268')).toBeTruthy()
      expect(screen.getByTitle('286 分：4 位候选人')).toBeTruthy()
      expect(screen.getByText(/百分位 = 得分低于您的候选人比例/)).toBeTruthy()
    })
  })

  it('shows no charts or percentiles while the pool is too small', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(4)) })
    addToHistory(entry(ID))
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.queryByText(/percentile/)).toBeNull()
    expect(screen.queryByText('Your score in each section')).toBeNull()
    // The simple score bars are still there, including the earnings note.
    expect(screen.getByText('Not claimed')).toBeTruthy()
  })

  it('swaps the simple score bars for the charts once the analysis opens', async () => {
    await open(withCharts)
    expect(screen.queryByText('Not claimed')).toBeNull()
    expect(screen.getByText('Your score in each section')).toBeTruthy()
  })
})

describe('choosing an occupation when submitting', () => {
  const okResult = () =>
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })

  it('submits the code of a listed occupation', async () => {
    okResult()
    reachSubmitCard()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'software engineer' } })
    fireEvent.click(screen.getByText('Software engineer'))
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'onshore' }),
      { kind: 'listed', code: '261313' },
    )
  })

  it('submits typed text for an occupation that is not listed', async () => {
    okResult()
    reachSubmitCard()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Barista' } })
    fireEvent.click(screen.getByText('Use "Barista" (not in the list)'))
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(expect.anything(), { kind: 'free', text: 'Barista' })
  })

  it('submits without an occupation when none is chosen', async () => {
    okResult()
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('remembers the occupation code in the history, and shows it in the visitor language', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({
      status: 'ok',
      submission: { id: ID, occupation: 'Software engineer', occupationCode: '261313', insights: waiting(3) },
    })
    reachSubmitCard()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'software engineer' } })
    fireEvent.click(screen.getByText('Software engineer'))
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(loadHistory()[0]).toMatchObject({ occupation: 'Software engineer', occupationCode: '261313' })

    // A later visit starts from the home page, not from the result page the submit moved to.
    cleanup()
    window.history.replaceState(null, '', '/')
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    openHistory(true)
    expect(screen.getByText('境内 · 软件工程师（Software engineer）')).toBeTruthy()
  })
})

describe('your percentile in three contexts', () => {
  const open = async (insights: Insights, lang: 'en' | 'zh' = 'en') => {
    if (lang === 'zh') localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.loadSubmission).mockResolvedValue({
      input: INPUT,
      submission: { id: ID, occupation: 'Software engineer', occupationCode: '261313', insights },
    })
    addToHistory(entry(ID, { occupation: 'Software engineer', occupationCode: '261313' }))
    renderApp()
    openHistory(lang === 'zh')
    fireEvent.click(screen.getByText(lang === 'zh' ? '546 分' : '546 points'))
  }
  const threeContexts: Insights = {
    total: 546, location: 'onshore',
    overall: { n: 23, percentile: 54, median: 536, mean: 540, meanPercentile: 50 },
    locationGroup: { n: 15, percentile: 60, median: 553 },
    occupation: { name: 'Software engineer', code: '261313', n: 9, percentile: 93, median: 450 },
  }

  it('shows the percentile for all candidates, the occupation and the location status', async () => {
    await open(threeContexts)
    await screen.findByText('Your percentile')
    for (const text of [
      'All candidates', '23 candidates', '54th percentile',
      'Software engineer', '9 candidates', '93rd percentile',
      'Onshore candidates', '15 candidates', '60th percentile',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
  })

  it('lists them in that order and shows no other group', async () => {
    await open(threeContexts)
    await screen.findByText('Your percentile')
    const order = ['All candidates', 'Software engineer', 'Onshore candidates'].map((label) => screen.getByText(label))
    // DOCUMENT_POSITION_FOLLOWING (4)
    expect(order[0].compareDocumentPosition(order[1]) & 4).toBe(4)
    expect(order[1].compareDocumentPosition(order[2]) & 4).toBe(4)
    expect(screen.queryByText(/ICT professionals/)).toBeNull()
    expect(screen.queryByText(/like-for-like/)).toBeNull()
  })

  it('needs no minimum number of candidates in the occupation or location, only one other person', async () => {
    await open({
      ...threeContexts,
      locationGroup: { n: 2, percentile: 75, median: 500 },
      occupation: { name: 'Software engineer', code: '261313', n: 2, percentile: 75, median: 500 },
    })
    await screen.findByText('Your percentile')
    expect(screen.getAllByText('2 candidates')).toHaveLength(2)
    expect(screen.getAllByText('75th percentile')).toHaveLength(2)
  })

  it('says so when the candidate is the first in their occupation', async () => {
    await open({ ...threeContexts, occupation: { name: 'Software engineer', code: '261313', n: 1 } })
    await screen.findByText('Your percentile')
    expect(screen.getByText('1 candidate')).toBeTruthy()
    expect(screen.getByText('You are the first so far')).toBeTruthy()
  })

  it('leaves out the location row when everyone is in the same location', async () => {
    await open({ ...threeContexts, locationGroup: { n: 23, percentile: 54, median: 536 } })
    await screen.findByText('Your percentile')
    expect(screen.queryByText('Onshore candidates')).toBeNull()
    expect(screen.getByText('All candidates')).toBeTruthy()
  })

  it('opens for an offshore candidate when the overall pool is big enough, however few are offshore', async () => {
    await open({
      total: 546, location: 'offshore',
      overall: { n: 23, percentile: 54, median: 536, mean: 540, meanPercentile: 50 },
      locationGroup: { n: 2, percentile: 75, median: 500 },
      occupation: null,
    })
    await screen.findByText('Your percentile')
    expect(screen.queryByText('Your score is saved')).toBeNull()
    expect(screen.getByText('Offshore candidates')).toBeTruthy()
    expect(screen.getByText('2 candidates')).toBeTruthy()
    expect(screen.getByText('75th percentile')).toBeTruthy()
  })

  it('shows only the overall percentile for a candidate with no occupation and no location group', async () => {
    await open({ total: 546, location: 'onshore', overall: { n: 23, percentile: 54, median: 536 }, occupation: null })
    await screen.findByText('Your percentile')
    expect(screen.getByText('All candidates')).toBeTruthy()
    expect(screen.queryByText('Onshore candidates')).toBeNull()
  })

  it('does not show the percentiles while the overall pool is below 10', async () => {
    await open({ ...waiting(6), locationGroup: { n: 4, percentile: 50, median: 500 } })
    await screen.findByText('Your score is saved')
    expect(screen.queryByText('Your percentile')).toBeNull()
    expect(screen.getByText(/So far 6 have/)).toBeTruthy()
  })

  it('names the three contexts in Chinese', async () => {
    await open(threeContexts, 'zh')
    await screen.findByText('您的百分位')
    for (const text of [
      '全部候选人', '23 位候选人', '第 54 百分位',
      '软件工程师（Software engineer）', '9 位候选人', '第 93 百分位',
      '境内候选人', '15 位候选人', '第 60 百分位',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
  })
})

describe('the per-device limit', () => {
  it('tells the candidate they have used their submissions, and stops them trying again', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'device_limit', limit: 5 })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText(
      'You have reached the limit of 5 submissions on this device. Your earlier results are still under Your submissions.',
    )
    expect((screen.getByText(CTA) as HTMLButtonElement).disabled).toBe(true)
    // It is a hard limit, so pressing the button again does nothing.
    fireEvent.click(screen.getByText(CTA))
    expect(api.submitScore).toHaveBeenCalledTimes(1)
    // Nothing was saved and the page did not move to a result.
    expect(window.location.pathname).toBe('/')
    expect(loadHistory()).toEqual([])
  })

  it('says the same in Chinese', async () => {
    localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'device_limit', limit: 5 })
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    type('您目前在维多利亚州技术岗位的年收入是多少？', '0')
    fireEvent.click(screen.getByText(CTA_ZH))
    await screen.findByText('此设备最多可提交 5 次，您已达到上限。之前的结果仍可在“您的提交记录”中查看。')
    expect((screen.getByText(CTA_ZH) as HTMLButtonElement).disabled).toBe(true)
  })

  it('still lets a candidate who is under the limit submit as normal', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', submission: submission(waiting(3)) })
    submitFromScratch()
    await screen.findByText('Your score is saved')
    expect(window.location.pathname).toBe(`/r/${ID}`)
  })
})
