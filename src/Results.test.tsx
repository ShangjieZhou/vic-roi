import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { VptDraft } from '../supabase/functions/_shared/scoring'
import { Results } from './Results'

const draft: VptDraft = {
  location: 'onshore', age: 30, english: 'proficient', experienceYears: 4, education: 'bachelors',
  skillLevel: 'unsure', partnerQualifies: 'unsure', annualEarnings: 0,
}

const render = (d: VptDraft) =>
  renderToStaticMarkup(
    <Results draft={d} submission={null} onRefine={() => {}} onRefresh={async () => {}} onSubmitted={() => {}} onRestart={() => {}} />,
  )

describe('Results', () => {
  it('shows a range and asks for the skipped answers instead of offering to submit', () => {
    const html = render(draft)
    expect(html).toContain('496-596')
    expect(html).toContain('Your score is a range')
    expect(html).toContain('Skill level of your nominated occupation')
    expect(html).toContain('Do you qualify for partner skill points?')
    expect(html).toContain('SkillSelect EOI')
    expect(html).toContain('You are single, have an Australian partner, or do not meet the requirements above')
    expect(html).not.toContain('Submit and compare my score against others')
  })

  it('asks only about the one skipped answer', () => {
    const html = render({ ...draft, skillLevel: 1 })
    expect(html).toContain('546-596')
    expect(html).toContain('You skipped a question')
    expect(html).not.toContain('Skill level of your nominated occupation')
  })

  it('offers submit once every answer is known', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('>546<')
    expect(html).toContain('Submit and compare my score against others')
    expect(html).not.toContain('Your score is a range')
  })

  it('scores an offshore candidate 0 income points out of 950 and keeps the income section', () => {
    const html = render({ ...draft, location: 'offshore', skillLevel: 1, partnerQualifies: true })
    expect(html).toContain('of 950')
    expect(html).not.toContain('of 800')
    expect(html).toContain('Victorian skilled earnings')
    expect(html).toContain('Offshore: counts as 0 income points')
    expect(html).not.toContain('Not applicable offshore')
  })

  it('gives an offshore candidate the same total as an onshore one with no income', () => {
    const offshore = render({ ...draft, location: 'offshore', skillLevel: 1, partnerQualifies: true, annualEarnings: 200_000 })
    const onshore = render({ ...draft, location: 'onshore', skillLevel: 1, partnerQualifies: true, annualEarnings: 0 })
    // Age 286, English 100, experience 60, education 50, skill level 50, partner 50, income 0.
    expect(offshore).toContain('>596<')
    expect(onshore).toContain('>596<')
  })

  it('offers one short call to action instead of a long explanation', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Submit and compare my score against others')
    // The earlier version explained the benefits at length. None of that text remains.
    for (const gone of [
      'See how you compare',
      'Once you submit, you will see:',
      'Your rank among all candidates, and within your occupation',
      'It is completely anonymous',
      'Insights appear once',
    ]) {
      expect(html, gone).not.toContain(gone)
    }
  })

  it('keeps a single short line saying the submission is anonymous', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Anonymous. No name, email or account needed.')
  })

  it('says briefly why adding an occupation helps', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Adds a comparison within your occupation.')
  })

  it('does not show the invitation to someone with an unresolved range', () => {
    const html = render(draft)
    expect(html).not.toContain('Submit and compare my score against others')
  })
})
