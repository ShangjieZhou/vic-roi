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
    expect(html).not.toContain('Submit anonymously and see my insights')
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
    expect(html).toContain('Submit anonymously and see my insights')
    expect(html).not.toContain('Your score is a range')
  })

  it('marks Victorian earnings not applicable offshore and caps the maximum at 800', () => {
    const html = render({ ...draft, location: 'offshore', skillLevel: 1, partnerQualifies: true })
    expect(html).toContain('Not applicable offshore')
    expect(html).toContain('of 800')
    expect(html).toContain('Offshore: Victorian earnings points do not apply')
  })

  it('invites the candidate to submit and spells out what they will unlock', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('See how you compare')
    expect(html).toContain('Once you submit, you will see:')
    expect(html).toContain('Your rank among all candidates, and within your occupation')
    expect(html).toContain('Where your score sits across the whole pool')
    expect(html).toContain('How each category compares with the average candidate')
    expect(html).toContain('The quickest ways to add points')
    expect(html).toContain('Submit anonymously and see my insights')
  })

  it('explains why adding an occupation helps', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Add it to also see how you compare with candidates in the same occupation.')
  })

  it('keeps the anonymity assurance beside the button', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Anonymous')
    expect(html).toContain('It is completely anonymous: no name, no email, no account.')
    expect(html.indexOf('completely anonymous')).toBeLessThan(html.indexOf('Submit anonymously and see my insights'))
  })

  it('sets honest expectations about the 10-candidate minimum', () => {
    const html = render({ ...draft, skillLevel: 1, partnerQualifies: false })
    expect(html).toContain('Insights appear once 10 candidates in your group have submitted.')
    expect(html).toContain('your result is saved and you can check back any time')
  })

  it('does not show the invitation to someone with an unresolved range', () => {
    const html = render(draft)
    expect(html).not.toContain('Once you submit, you will see:')
  })
})
