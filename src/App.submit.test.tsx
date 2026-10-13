// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// The history starts expanded. This opens it only if a test has collapsed it.
const openHistory = (zh = false) => {
  const header = screen.getByText(zh ? /^您的提交$/ : /^Your submission$/)
  if (header.closest('button')?.getAttribute('aria-expanded') !== 'true') fireEvent.click(header)
}
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
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })
    submitFromScratch()

    await screen.findByText('Your score is saved')
    expect(screen.getByText('Comparisons unlock once 10 candidates have submitted. So far 3 have, including you.')).toBeTruthy()
    expect(
      screen.getByText(
        'You can stay on this page, or come back to this link later and refresh to see your analysis once enough candidates have submitted.',
      ),
    ).toBeTruthy()
    expect(screen.getByText(/listed under Your submission/)).toBeTruthy()
    expect(screen.getByText('Your submission is anonymous, so there is nothing to worry about while you wait.')).toBeTruthy()
    expect(screen.queryByText('Not enough data yet')).toBeNull()
    expect(screen.queryByText('Where you rank')).toBeNull()
    expect(screen.queryByText('Your ranking')).toBeNull()

    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(loadHistory()).toEqual([
      expect.objectContaining({ id: ID, total: 546, location: 'onshore', occupation: null, occupationCode: null }),
    ])
  })

  it('"Check again" says still waiting, then reveals the analysis once the pool is big enough', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(4)) })
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
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })
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
  it('sits below the question and starts expanded', () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    addToHistory(entry(ID2, { total: 810, location: 'offshore', savedAt: Date.now() - 60_000 }))
    renderApp()
    const header = screen.getByText('Your submission')
    const question = screen.getByText('How old are you?')
    // DOCUMENT_POSITION_FOLLOWING (4): the history comes after the question.
    expect(question.compareDocumentPosition(header) & 4).toBe(4)
    expect(screen.getByRole('button', { name: /^Your submission$/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('546 points')).toBeTruthy()
    expect(screen.getByText('810 points')).toBeTruthy()
  })

  it('lists each submission with score, group, occupation and age, newest first', () => {
    addToHistory(entry(ID, { occupation: 'Registered Nurse' }))
    addToHistory(entry(ID2, { total: 810, location: 'offshore', savedAt: Date.now() - 60_000 }))
    renderApp()
    openHistory()
    expect(screen.getByRole('button', { name: /^Your submission$/ }).getAttribute('aria-expanded')).toBe('true')
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

  it('shows every entry, and collapses when the header is pressed', () => {
    for (let n = 0; n < 5; n++) {
      addToHistory(entry(`9a1b2c3d-1111-4222-8333-44445555000${n}`, { total: 600 + n, savedAt: Date.now() - n * 1000 }))
    }
    renderApp()
    expect(rowLinks()).toHaveLength(5)
    fireEvent.click(screen.getByText('Your submission'))
    expect(screen.queryByText('600 points')).toBeNull()
    expect(screen.getByRole('button', { name: /^Your submission$/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('no longer opens the home screen with a privacy banner or an anonymity note in the history', () => {
    addToHistory(entry(ID))
    renderApp()
    expect(screen.queryByText(/Free to use/)).toBeNull()
    openHistory()
    expect(screen.queryByText(/Every submission is anonymous/)).toBeNull()
  })

  it('shows nothing extra for a first-time visitor', () => {
    renderApp()
    expect(screen.queryByText(/^Your submission$/)).toBeNull()
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
    expect(screen.getByText('‹ My submission')).toBeTruthy()
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

    fireEvent.click(screen.getByText('‹ My submission'))
    expect(await screen.findByText('Your submission')).toBeTruthy()
    expect(window.location.pathname).toBe('/')

    // Forward to the result again, then Back.
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Where you rank')
    window.history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByText('Your submission')).toBeTruthy()
    expect(screen.queryByText('Where you rank')).toBeNull()
  })

  it('adds each new submission to the list, newest first, without duplicates', async () => {
    addToHistory(entry(ID2, { total: 700, savedAt: Date.now() - 86_400_000 }))
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })
    submitFromScratch()
    await screen.findByText('Your score is saved')
    expect(loadHistory().map((e) => e.id)).toEqual([ID, ID2])
  })

  it('has no way to clear the list and no device-only note', () => {
    addToHistory(entry(ID))
    renderApp()
    openHistory()
    expect(screen.queryByText('Clear this list')).toBeNull()
    expect(screen.queryByText(/Saved on this device only/)).toBeNull()
  })

  it('shows the history in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    addToHistory(entry(ID, { occupation: '护士' }))
    renderApp()
    expect(screen.getByText('您的提交')).toBeTruthy()
    openHistory(true)
    expect(screen.getByText('546 分')).toBeTruthy()
    expect(screen.getByText('境内 · 护士')).toBeTruthy()
  })

  it('hides the history after the first step', () => {
    addToHistory(entry(ID))
    renderApp()
    type('How old are you?', '30')
    expect(screen.queryByText(/^Your submission$/)).toBeNull()
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
      expect(screen.getAllByText('You: top 45%').length).toBeGreaterThan(0)
      expect(screen.getByText('Your score').nextSibling?.textContent).toBe('546')
      expect(screen.getByText('Median').nextSibling?.textContent).toBe('520')
      expect(screen.getByText('Average').nextSibling?.textContent).toBe('530')
      expect(screen.getByText('Lowest')).toBeTruthy()
      expect(screen.getByText('Highest')).toBeTruthy()
    })

    it('places the candidate at their percentile, the median at 50 and the average at its own percentile', async () => {
      await open(withCharts)
      const bar = screen.getByRole('img', { name: 'You: top 45%' })
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
      expect(screen.getAllByText('您：前45%').length).toBeGreaterThan(0)
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
        expect(screen.getAllByText(label).length, label).toBeGreaterThan(0)
      }
      // One bar per possible score: 19 + 3 + 6 + 4 + 2 + 2 + 20.
      expect(screen.getAllByTitle(/ at \d+ points$/)).toHaveLength(56)
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

    it('shows the top percent and the median under each section', async () => {
      await open(withCharts)
      for (const text of [
        'Top 22% · Median 300 | Ages 20 to 29', 'Top 79% · Median 100 | Proficient',
        'Top 60% · Median 60 | 3 to 5 years', "Top 67% · Median 50 | Bachelor's or Honours",
        'Top 37% · Median 50 | Skill level 1', 'Top 53% · Median 0 | No partner points',
        'Top 13% · Median 0 | Under $80,000, or offshore',
      ]) {
        expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text), text).toBeTruthy()
      }
    })

    it('shows a bar for every possible score, including ones nobody has', async () => {
      await open(withCharts)
      // English can give 0, 100 or 200 and education 25, 50, 75 or 100: nobody has education 25 or 100.
      expect(screen.getAllByTitle('0 candidates at 25 points')[0]).toBeTruthy()
      // Age has no bar merged away: 0 and every score from 16 to 300 appear.
      expect(screen.getAllByTitle('0 candidates at 16 points')[0]).toBeTruthy()
      expect(screen.getByTitle('0 candidates at 265 points')).toBeTruthy()
      // Earnings: 0 plus the 19 bands.
      expect(screen.getAllByTitle('0 candidates at 150 points')[0]).toBeTruthy()
    })

    it('highlights the candidate\'s own numbers', async () => {
      await open(withCharts)
      expect(screen.getByText('Top 22%').className).toContain('text-accent')
      expect(screen.getByText('Your score').nextSibling).toHaveProperty('className', expect.stringContaining('text-accent'))
      expect(screen.getByText('Top 22%')).toBeTruthy()
    })

    it('explains how the top percent treats ties', async () => {
      await open(withCharts)
      expect(screen.getByText(/Top xx% is the share of candidates who scored higher than you, plus half of those who tied/)).toBeTruthy()
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
      expect(screen.getAllByText('Victorian skilled earnings').length).toBeGreaterThan(0)
      expect(screen.getByTitle('7 candidates at 0 points').className).toContain('bg-accent')
    })

    it('falls back to a plain bar when the server sends no distribution', async () => {
      await open(ranked)
      expect(screen.getByText('Your score in each section')).toBeTruthy()
      expect(screen.queryByTitle(/ at \d+ points$/)).toBeNull()
      expect(screen.queryByText(/Top \d+% · Median/)).toBeNull()
      expect(screen.queryByText(/Top xx% is the share/)).toBeNull()
    })

    it('is shown in Chinese', async () => {
      await open(withCharts, 'zh')
      expect(screen.getByText('各部分得分分布')).toBeTruthy()
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '前22% · 中位数 300 | 20 至 29 岁')).toBeTruthy()
      expect(screen.getByTitle('286 分：4 位候选人')).toBeTruthy()
      expect(screen.getByText(/“前xx%”表示得分高于您的候选人所占比例/)).toBeTruthy()
    })
  })

  it('shows no charts or percentiles while the pool is too small', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(4)) })
    addToHistory(entry(ID))
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.queryByText(/Top \d+%/)).toBeNull()
    expect(screen.queryByText('Your score in each section')).toBeNull()
    // The simple score bars are still there, including the earnings note.
    expect(screen.getByText('Not claimed')).toBeTruthy()
  })

  it('moves the score bars into a breakdown section once the analysis opens', async () => {
    await open(withCharts)
    expect(screen.getByText('Your score breakdown')).toBeTruthy()
    expect(screen.getAllByText('Not claimed')).toHaveLength(1) // one set of bars, not two
    expect(screen.getByText('Your score in each section')).toBeTruthy()
  })
})

describe('support card', () => {
  afterEach(() => vi.unstubAllEnvs())

  const open = async (insights: Insights, lang: 'en' | 'zh' = 'en') => {
    if (lang === 'zh') localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(insights) })
    addToHistory(entry(ID))
    renderApp()
    openHistory(lang === 'zh')
    fireEvent.click(screen.getByText(lang === 'zh' ? '546 分' : '546 points'))
    await screen.findByText(lang === 'zh' ? '您的位置' : 'Where you rank')
  }

  it('offers a tip at the bottom of the analysis, linking to the Buy Me a Coffee page', async () => {
    vi.stubEnv('VITE_FEEDBACK_URL', '')
    await open(withCharts)
    const coffee = screen.getByText('Buy me a coffee').closest('a')!
    expect(coffee.getAttribute('href')).toBe('https://buymeacoffee.com/shangjie')
    expect(coffee.getAttribute('target')).toBe('_blank')
    expect(coffee.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText(/any amount is appreciated/)).toBeTruthy()
    expect(screen.queryByText('Send feedback')).toBeNull()
    // It comes after the share link and before the disclaimer.
    const share = screen.getByText('Keep this link to return to your result.')
    expect(share.compareDocumentPosition(coffee) & 4).toBe(4)
  })

  it('shows a feedback button once a form link is set', async () => {
    vi.stubEnv('VITE_FEEDBACK_URL', 'https://forms.gle/example')
    await open(withCharts)
    expect(screen.getByText('Send feedback').closest('a')!.getAttribute('href')).toBe('https://forms.gle/example')
  })

  it('is not shown under the score before submitting', () => {
    reachSubmitCard()
    expect(screen.queryByText('Found it helpful?')).toBeNull()
  })

  it('stays hidden while the comparison is still locked', async () => {
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: submission(waiting(4)) })
    addToHistory(entry(ID))
    renderApp()
    openHistory()
    fireEvent.click(screen.getByText('546 points'))
    await screen.findByText('Your score is saved')
    expect(screen.queryByText('Buy me a coffee')).toBeNull()
  })

  it('is shown in Chinese', async () => {
    await open(withCharts, 'zh')
    expect(screen.getByText('给Ta打赏')).toBeTruthy()
  })
})

describe('choosing an occupation when submitting', () => {
  const okResult = () =>
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })

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
      { turnstileToken: null, replace: false },
    )
  })

  it('submits typed text for an occupation that is not listed', async () => {
    okResult()
    reachSubmitCard()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Barista' } })
    fireEvent.click(screen.getByText('Use "Barista" (not in the list)'))
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(expect.anything(), { kind: 'free', text: 'Barista' }, { turnstileToken: null, replace: false })
  })

  it('submits without an occupation when none is chosen', async () => {
    okResult()
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(expect.anything(), null, { turnstileToken: null, replace: false })
  })

  it('remembers the occupation code in the history, and shows it in the visitor language', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({
      status: 'ok',
      replaced: [],
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
    await screen.findByText('Your ranking')
    for (const text of [
      'All candidates', '23 candidates', 'Top 46%',
      'Software engineer', '9 candidates', 'Top 7%',
      'Onshore candidates', '15 candidates', 'Top 40%',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
  })

  it('lists them in that order and shows no other group', async () => {
    await open(threeContexts)
    await screen.findByText('Your ranking')
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
    await screen.findByText('Your ranking')
    expect(screen.getAllByText('2 candidates')).toHaveLength(2)
    expect(screen.getAllByText('Top 25%')).toHaveLength(2)
  })

  it('says so when the candidate is the first in their occupation', async () => {
    await open({ ...threeContexts, occupation: { name: 'Software engineer', code: '261313', n: 1 } })
    await screen.findByText('Your ranking')
    expect(screen.getByText('1 candidate')).toBeTruthy()
    expect(screen.getByText('You are the first so far')).toBeTruthy()
  })

  it('leaves out the location row when everyone is in the same location', async () => {
    await open({ ...threeContexts, locationGroup: { n: 23, percentile: 54, median: 536 } })
    await screen.findByText('Your ranking')
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
    await screen.findByText('Your ranking')
    expect(screen.queryByText('Your score is saved')).toBeNull()
    expect(screen.getByText('Offshore candidates')).toBeTruthy()
    expect(screen.getByText('2 candidates')).toBeTruthy()
    expect(screen.getByText('Top 25%')).toBeTruthy()
  })

  it('shows only the overall percentile for a candidate with no occupation and no location group', async () => {
    await open({ total: 546, location: 'onshore', overall: { n: 23, percentile: 54, median: 536 }, occupation: null })
    await screen.findByText('Your ranking')
    expect(screen.getByText('All candidates')).toBeTruthy()
    expect(screen.queryByText('Onshore candidates')).toBeNull()
  })

  it('does not show the percentiles while the overall pool is below 10', async () => {
    await open({ ...waiting(6), locationGroup: { n: 4, percentile: 50, median: 500 } })
    await screen.findByText('Your score is saved')
    expect(screen.queryByText('Your ranking')).toBeNull()
    expect(screen.getByText(/So far 6 have/)).toBeTruthy()
  })

  it('names the three contexts in Chinese', async () => {
    await open(threeContexts, 'zh')
    await screen.findByText('您在各群体中的排名')
    for (const text of [
      '全部候选人', '23 位候选人', '前46%',
      '软件工程师（Software engineer）', '9 位候选人', '前7%',
      '境内候选人', '15 位候选人', '前40%',
    ]) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
  })
})

describe('one submission per device', () => {
  const FIRST = { id: ID2, total: 700 }
  const okReplacing = () =>
    vi.mocked(api.submitScore).mockResolvedValue({
      status: 'ok',
      replaced: [ID2],
      submission: submission(waiting(3)),
    })

  it('asks before replacing, and says what withdrawing means', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'already_submitted', existing: FIRST })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    expect(
      screen.getByText(
        'Each device can have one submission, which keeps the comparison honest. Submitting again withdraws your current submission (700 points) and deletes it from the database for good. This score takes its place.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Withdraw my current submission and submit this one')).toBeTruthy()
    expect(screen.getByText('View my current result')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
    // The normal button is out of the way, and nothing was saved or changed.
    expect(screen.queryByText(CTA)).toBeNull()
    expect(window.location.pathname).toBe('/')
    expect(loadHistory()).toEqual([])
  })

  it('first tries to submit without replacing anything', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'already_submitted', existing: FIRST })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    expect(api.submitScore).toHaveBeenCalledTimes(1)
    expect(api.submitScore).toHaveBeenNthCalledWith(1, expect.anything(), null, { turnstileToken: null, replace: false })
  })

  it('withdraws the current submission and saves the new one only after the candidate agrees', async () => {
    addToHistory(entry(ID2, { total: 700 }))
    vi.mocked(api.submitScore)
      .mockResolvedValueOnce({ status: 'already_submitted', existing: FIRST })
      .mockResolvedValueOnce({ status: 'ok', replaced: [ID2], submission: submission(waiting(3)) })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    fireEvent.click(screen.getByText('Withdraw my current submission and submit this one'))
    await screen.findByText('Your score is saved')

    expect(api.submitScore).toHaveBeenNthCalledWith(2, expect.anything(), null, { turnstileToken: null, replace: true })
    expect(window.location.pathname).toBe(`/r/${ID}`)
    // The withdrawn result is deleted on the server, so it leaves the list. Only the new one is left.
    expect(loadHistory().map((e) => e.id)).toEqual([ID])
  })

  it('keeps everything as it was when the candidate cancels', async () => {
    addToHistory(entry(ID2, { total: 700 }))
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'already_submitted', existing: FIRST })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('You have already submitted from this device')).toBeNull()
    expect(screen.getByText(CTA)).toBeTruthy()
    expect(api.submitScore).toHaveBeenCalledTimes(1)
    expect(loadHistory().map((e) => e.id)).toEqual([ID2])
  })

  it('lets the candidate look at their current result instead', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'already_submitted', existing: FIRST })
    vi.mocked(api.loadSubmission).mockResolvedValue({ input: INPUT, submission: { ...submission(ranked), id: ID2 } })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    fireEvent.click(screen.getByText('View my current result'))
    await screen.findByText('Where you rank')
    expect(api.loadSubmission).toHaveBeenCalledWith(ID2)
    expect(window.location.pathname).toBe(`/r/${ID2}`)
    expect(api.submitScore).toHaveBeenCalledTimes(1)
  })

  it('shows progress while withdrawing and cannot be pressed twice', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.submitScore>>) => void
    vi.mocked(api.submitScore)
      .mockResolvedValueOnce({ status: 'already_submitted', existing: FIRST })
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    fireEvent.click(screen.getByText('Withdraw my current submission and submit this one'))
    const busy = (await screen.findByText('Withdrawing...')) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(api.submitScore).toHaveBeenCalledTimes(2)
    finish({ status: 'ok', replaced: [ID2], submission: submission(waiting(3)) })
    await screen.findByText('Your score is saved')
  })

  it('keeps the choice open and explains when the replacement fails', async () => {
    vi.mocked(api.submitScore)
      .mockResolvedValueOnce({ status: 'already_submitted', existing: FIRST })
      .mockResolvedValueOnce({ status: 'error' })
    reachSubmitCard()
    fireEvent.click(screen.getByText(CTA))
    await screen.findByText('You have already submitted from this device')
    fireEvent.click(screen.getByText('Withdraw my current submission and submit this one'))
    await screen.findByText('Could not submit right now. Your score above is unaffected. Try again shortly.')
    expect(screen.getByText('Withdraw my current submission and submit this one')).toBeTruthy()
  })

  it('says the same in Chinese', async () => {
    localStorage.setItem('vpt-lang', 'zh')
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'already_submitted', existing: FIRST })
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    type('您目前在维多利亚州技术岗位的年收入是多少？', '0')
    fireEvent.click(screen.getByText(CTA_ZH))
    await screen.findByText('您已在此设备上提交过')
    expect(
      screen.getByText(
        '为保证对比的真实性，每台设备只能有一份提交。再次提交将撤回您当前的提交（700 分），并将其从数据库中永久删除，本次分数将取而代之。',
      ),
    ).toBeTruthy()
    expect(screen.getByText('撤回我当前的提交并提交此分数')).toBeTruthy()
    expect(screen.getByText('查看我当前的结果')).toBeTruthy()
    expect(screen.getByText('取消')).toBeTruthy()
  })

  it('still lets a candidate with no earlier submission submit as normal', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })
    submitFromScratch()
    await screen.findByText('Your score is saved')
    expect(window.location.pathname).toBe(`/r/${ID}`)
    expect(okReplacing).toBeDefined()
  })
})

describe('the bot check', () => {
  const SITE_KEY = '1x00000000000000000000AA' // Cloudflare's published test key
  interface Rendered { el: HTMLElement; options: Record<string, unknown> }
  let rendered: Rendered[]
  let reset: ReturnType<typeof vi.fn>
  let remove: ReturnType<typeof vi.fn>

  beforeEach(() => {
    rendered = []
    reset = vi.fn()
    remove = vi.fn()
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', SITE_KEY)
    // Declaring the API up front means the script is never fetched.
    window.turnstile = {
      render: (el, options) => {
        rendered.push({ el, options })
        return `widget-${rendered.length}`
      },
      reset,
      remove,
    }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.turnstile
  })

  // The widget is created once the script check resolves, a moment after the card appears.
  const reachWidget = async () => {
    reachSubmitCard()
    await waitFor(() => expect(rendered.length).toBeGreaterThan(0))
  }
  const widget = () => rendered[rendered.length - 1]
  const pass = (token = 'good-token') => act(() => (widget().options.callback as (t: string) => void)(token))
  const cta = () => screen.getByText(CTA) as HTMLButtonElement

  it('waits for the check before the button works, then sends the token with the score', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'ok', replaced: [], submission: submission(waiting(3)) })
    await reachWidget()
    expect(cta().disabled).toBe(true)
    expect(screen.getByText('Verifying...')).toBeTruthy()

    pass('good-token')
    expect(cta().disabled).toBe(false)
    expect(screen.queryByText('Verifying...')).toBeNull()

    fireEvent.click(cta())
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenCalledWith(expect.anything(), null, { turnstileToken: 'good-token', replace: false })
  })

  it('sets up an invisible widget with the right key and language', async () => {
    await reachWidget()
    expect(rendered).toHaveLength(1)
    expect(rendered[0].options).toMatchObject({ sitekey: SITE_KEY, appearance: 'interaction-only', language: 'en' })
  })

  it('uses Chinese for the widget in Chinese, and starts again when the language changes', async () => {
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    type('您目前在维多利亚州技术岗位的年收入是多少？', '0')
    await waitFor(() => expect(rendered.length).toBeGreaterThan(0))
    expect(widget().options.language).toBe('zh-cn')
    pass('t')
    expect((screen.getByText(CTA_ZH) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByText('English'))
    await waitFor(() => expect(rendered.at(-1)!.options.language).toBe('en'))
    expect(remove).toHaveBeenCalled()
    // A new widget means a new check.
    expect((screen.getByText(CTA) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables the button again when the token expires', async () => {
    await reachWidget()
    pass()
    expect(cta().disabled).toBe(false)
    act(() => (widget().options['expired-callback'] as () => void)())
    expect(cta().disabled).toBe(true)
  })

  it('discards the token and asks for a new one when the server rejects it', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'bot_check_failed' })
    await reachWidget()
    pass()
    fireEvent.click(cta())
    await screen.findByText('We could not confirm you are a person. Please try again.')
    expect(reset).toHaveBeenCalledWith('widget-1')
    expect(cta().disabled).toBe(true)
    pass('fresh-token')
    expect(cta().disabled).toBe(false)
  })

  it('also asks for a new token after a failed save, since the old one was used up', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'error' })
    await reachWidget()
    pass()
    fireEvent.click(cta())
    await screen.findByText('Could not submit right now. Your score above is unaffected. Try again shortly.')
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('reuses the same token for the replacement, because the earlier answer did not use it up', async () => {
    vi.mocked(api.submitScore)
      .mockResolvedValueOnce({ status: 'already_submitted', existing: { id: ID2, total: 700 } })
      .mockResolvedValueOnce({ status: 'ok', replaced: [ID2], submission: submission(waiting(3)) })
    await reachWidget()
    pass('only-token')
    fireEvent.click(cta())
    await screen.findByText('You have already submitted from this device')
    expect(reset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Withdraw my current submission and submit this one'))
    await screen.findByText('Your score is saved')
    expect(api.submitScore).toHaveBeenNthCalledWith(2, expect.anything(), null, { turnstileToken: 'only-token', replace: true })
  })

  it('does not reset the check for a rejected occupation, which never reached it', async () => {
    vi.mocked(api.submitScore).mockResolvedValue({ status: 'invalid_occupation' })
    await reachWidget()
    pass()
    fireEvent.click(cta())
    await screen.findByText('Use letters, numbers and basic punctuation only for the occupation.')
    expect(reset).not.toHaveBeenCalled()
    expect(cta().disabled).toBe(false)
  })

  it('explains and stays blocked when the check cannot run, such as when a blocker stops it loading', async () => {
    await reachWidget()
    act(() => (widget().options['error-callback'] as () => void)())
    expect(screen.getByText('The security check could not load. Check your connection or turn off content blockers, then reload the page.')).toBeTruthy()
    expect(cta().disabled).toBe(true)
  })

  it('recovers if the check starts working again', async () => {
    await reachWidget()
    act(() => (widget().options['error-callback'] as () => void)())
    pass('late-token')
    expect(screen.queryByText(/security check could not load/)).toBeNull()
    expect(cta().disabled).toBe(false)
  })

  it('takes the widget down when the card goes away', async () => {
    await reachWidget()
    cleanup()
    expect(remove).toHaveBeenCalledWith('widget-1')
  })

  it('shows nothing of this when no site key is set', async () => {
    vi.unstubAllEnvs()
    rendered.length = 0
    reachSubmitCard()
    // Give a widget every chance to appear. None should.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(rendered).toHaveLength(0)
    expect(screen.queryByText('Verifying...')).toBeNull()
    expect(cta().disabled).toBe(false)
  })
})
