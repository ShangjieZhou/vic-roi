// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { LangProvider } from './i18n'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.lang = 'en'
})

const renderApp = () =>
  render(
    <LangProvider>
      <App />
    </LangProvider>,
  )

const pick = (label: string) => fireEvent.click(screen.getByText(label))
const type = (title: string, value: string) => {
  fireEvent.change(screen.getByLabelText(title), { target: { value } })
  fireEvent.submit(screen.getByLabelText(title).closest('form')!)
}
const EARNINGS = 'What is your annual earnings from current skilled employment in Victoria?'

// Everything before the earnings question, with partner left to the caller.
function answerUpToPartner(skill = 'Skill level 1') {
  type('How old are you?', '30')
  pick('Proficient')
  pick('3 to 5 years')
  pick("Bachelor's or Honours")
  pick(skill)
}

describe('wizard flow', () => {
  it('starts with age and has seven steps', () => {
    render(<App />)
    expect(screen.getByText('How old are you?')).toBeTruthy()
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    expect(screen.queryByText('Are you onshore or offshore?')).toBeNull()
  })

  // Current Chrome returns a Promise from window.scrollTo. An effect that returns it makes React
  // call it as a cleanup function and crash when the step unmounts.
  it('survives scrollTo returning a Promise while changing steps', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation((() => Promise.resolve()) as unknown as typeof window.scrollTo)
    render(<App />)
    type('How old are you?', '30')
    expect(screen.getByText('What is your English level?')).toBeTruthy()
    pick('Proficient')
    expect(screen.getByText('How many years of experience do you have in your nominated occupation?')).toBeTruthy()
  })

  it('spells out the three partner skill requirements', () => {
    render(<App />)
    answerUpToPartner()
    expect(screen.getByText('Do you qualify for partner skill points?')).toBeTruthy()
    expect(screen.getByText('You have claimed 10 points for Partner Skills in your SkillSelect EOI')).toBeTruthy()
    expect(screen.getByText('Your partner will be included in your state nominated visa application')).toBeTruthy()
    expect(screen.getByText("Your partner's occupation is a current priority industry occupation")).toBeTruthy()
    expect(screen.getByText('Yes, all three apply')).toBeTruthy()
    expect(screen.getByText("Skip, I'm not sure")).toBeTruthy()
  })

  it('completes with skipped answers and shows a range', () => {
    render(<App />)
    answerUpToPartner("Skip, I'm not sure")
    pick("Skip, I'm not sure")
    type(EARNINGS, '0')
    expect(screen.getByText('Your score is a range')).toBeTruthy()
  })

  it('treats an entered amount as onshore and scores the earnings', () => {
    render(<App />)
    answerUpToPartner()
    pick('You are single, have an Australian partner, or do not meet the requirements above')
    type(EARNINGS, '100000')
    expect(screen.queryByText('Not applicable offshore')).toBeNull()
    expect(screen.getByText('of 950')).toBeTruthy()
    expect(screen.getByText('Submit anonymously and see my insights')).toBeTruthy()
  })

  it('offers offshore on the earnings step and drops the earnings points', () => {
    render(<App />)
    answerUpToPartner()
    pick('You are single, have an Australian partner, or do not meet the requirements above')
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    pick('I am offshore')
    expect(screen.getByText('Not applicable offshore')).toBeTruthy()
    expect(screen.getByText('of 800')).toBeTruthy()
    expect(screen.getByText('Submit anonymously and see my insights')).toBeTruthy()
  })

  it('puts the offshore option above the earnings field and does not autofocus the field', () => {
    render(<App />)
    answerUpToPartner()
    pick('You are single, have an Australian partner, or do not meet the requirements above')
    const offshore = screen.getByText('I am offshore')
    const field = screen.getByLabelText(EARNINGS)
    // DOCUMENT_POSITION_FOLLOWING (4) means the field comes after the offshore option.
    expect(offshore.compareDocumentPosition(field) & 4).toBe(4)
    expect(document.activeElement).not.toBe(field)
  })
})

describe('simplified Chinese', () => {
  it('switches the whole screen and remembers the choice', () => {
    renderApp()
    expect(screen.getByText('How old are you?')).toBeTruthy()
    // Both languages are always shown, and the active one is marked.
    expect(screen.getByText('English').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('中文').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByText('中文'))
    expect(screen.getByText('中文').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('English').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('您的年龄是？')).toBeTruthy()
    expect(screen.getByText('第 1 步，共 7 步')).toBeTruthy()
    expect(screen.getByText('VPT 积分计算器')).toBeTruthy()
    expect(screen.queryByText('How old are you?')).toBeNull()
    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(localStorage.getItem('vpt-lang')).toBe('zh')

    cleanup()
    renderApp()
    expect(screen.getByText('您的年龄是？')).toBeTruthy()
    fireEvent.click(screen.getByText('English'))
    expect(screen.getByText('How old are you?')).toBeTruthy()
  })

  it('keeps the answers when the language changes mid-form', () => {
    renderApp()
    type('How old are you?', '30')
    pick('Proficient')
    fireEvent.click(screen.getByText('中文'))
    expect(screen.getByText('您在所提名职业中有多少年工作经验？')).toBeTruthy()
    expect(screen.getByText('第 3 步，共 7 步')).toBeTruthy()
  })

  it('runs the whole form in Chinese to an offshore result', () => {
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    expect(screen.getByText('您是否符合配偶技能分的条件？')).toBeTruthy()
    expect(screen.getByText('您已在 SkillSelect 意向书（EOI）中申报 10 分配偶技能分')).toBeTruthy()
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    pick('我在境外')
    expect(screen.getByText('您的维州积分测试（VPT）估算分数')).toBeTruthy()
    expect(screen.getByText('满分 800')).toBeTruthy()
    expect(screen.getByText('境外不适用')).toBeTruthy()
    expect(screen.getByText('匿名提交，查看我的分析')).toBeTruthy()
    expect(screen.getByText('年龄')).toBeTruthy()
    expect(screen.getByText('维州技术工作收入')).toBeTruthy()
  })

  it('shows a score range and the refine prompt in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('跳过，我不确定')
    pick('跳过，我不确定')
    type('您目前在维多利亚州技术岗位的年收入是多少？', '0')
    expect(screen.getByText('您的分数是一个区间')).toBeTruthy()
    expect(screen.getByText('您跳过了两个问题。请回答它们，以获得精确分数并与其他候选人比较。')).toBeTruthy()
  })

  it('requires an income answer: blank is not allowed but 0 is', () => {
    renderApp()
    answerUpToPartner()
    pick('You are single, have an Australian partner, or do not meet the requirements above')
    const button = screen.getByText('See my score') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.queryByText(/leave it blank/i)).toBeNull()
    fireEvent.change(screen.getByLabelText(EARNINGS), { target: { value: '0' } })
    expect((screen.getByText('See my score') as HTMLButtonElement).disabled).toBe(false)
  })

  it('uses the same skip wording on the skill and partner steps, in both languages', () => {
    for (const [lang, wording, skill, partnerNo] of [
      ['en', "Skip, I'm not sure", 'Skill level 1', 'You are single, have an Australian partner, or do not meet the requirements above'],
      ['zh', '跳过，我不确定', '技能等级 1', '您单身、配偶是澳大利亚人，或不满足上述要求'],
    ] as const) {
      localStorage.setItem('vpt-lang', lang)
      renderApp()
      type(lang === 'en' ? 'How old are you?' : '您的年龄是？', '30')
      pick(lang === 'en' ? 'Proficient' : '熟练（Proficient）')
      pick(lang === 'en' ? '3 to 5 years' : '3 至 5 年')
      pick(lang === 'en' ? "Bachelor's or Honours" : "学士或荣誉学士（Bachelor's or Honours）")
      expect(screen.getByText(wording)).toBeTruthy() // skill step
      pick(skill)
      expect(screen.getByText(wording)).toBeTruthy() // partner step
      expect(screen.getByText(partnerNo)).toBeTruthy()
      cleanup()
    }
  })

  it('shows the English name in brackets for every education option in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    expect(screen.getByText('其他资格（Other qualification）')).toBeTruthy()
    expect(screen.getByText("学士或荣誉学士（Bachelor's or Honours）")).toBeTruthy()
    expect(screen.getByText("硕士（Master's）")).toBeTruthy()
    expect(screen.getByText('博士（PhD）')).toBeTruthy()
  })

  it('invites the candidate to submit, in Chinese', () => {
    localStorage.setItem('vpt-lang', 'zh')
    renderApp()
    type('您的年龄是？', '30')
    pick('熟练（Proficient）')
    pick('3 至 5 年')
    pick("学士或荣誉学士（Bachelor's or Honours）")
    pick('技能等级 1')
    pick('您单身、配偶是澳大利亚人，或不满足上述要求')
    pick('我在境外')
    expect(screen.getByText('看看您和其他候选人相比如何')).toBeTruthy()
    expect(screen.getByText('提交后，您将看到：')).toBeTruthy()
    expect(screen.getByText('您在全部候选人以及同职业候选人中的排名')).toBeTruthy()
    expect(screen.getByText('每个评分项与平均水平的对比')).toBeTruthy()
    expect(screen.getByText('填写后，还可以看到您与同职业候选人的对比。')).toBeTruthy()
    expect(screen.getByText('匿名提交，查看我的分析')).toBeTruthy()
    expect(screen.getByText(/当您所在群体有 10 位候选人提交后，分析就会显示/)).toBeTruthy()
  })
})
