import { useId, type ReactNode } from 'react'
import { parseVptInput, type VptInput } from '../../supabase/functions/_shared/scoring'
import { labelFor } from './labels'
import { INPUT, SELECT } from './ui'

// The candidate's answers as text, the way the form boxes hold them.
export interface Answers {
  age: string
  english: string
  experience: string
  education: string
  skill: string
  partner: string
  earnings: string
  location: string
}

export const defaultAnswers: Answers = {
  age: '30', english: 'proficient', experience: '4', education: 'bachelors', skill: '1', partner: 'no', earnings: '0', location: 'onshore',
}

// The values the server accepts, or null when an answer is out of range. The server checks again.
export function inputFrom(a: Answers): VptInput | null {
  return parseVptInput({
    location: a.location,
    age: Number(a.age),
    english: a.english,
    experienceYears: Number(a.experience),
    education: a.education,
    skillLevel: Number(a.skill),
    partnerQualifies: a.partner === 'yes',
    annualEarnings: Number(a.earnings === '' ? 0 : a.earnings),
  })
}

export const CHOICES = {
  english: ['competent', 'proficient', 'superior'],
  experience: ['0', '1', '2', '4', '6', '9'],
  education: ['other', 'bachelors', 'masters', 'phd'],
  skill: ['1', '2', '3'],
  partner: ['yes', 'no'],
  location: ['onshore', 'offshore'],
} as const

export function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{props.label}</span>
      <div className="mt-1">{props.children}</div>
    </label>
  )
}

export function Select(props: { label: string; value: string; values: readonly string[]; dimension: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <select id={id} className={`${SELECT} mt-1 w-full`} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.values.map((v) => (
          <option key={v} value={v}>
            {labelFor(props.dimension, v)}
          </option>
        ))}
      </select>
    </div>
  )
}

// Every answer except location, which callers place themselves.
export function AnswerFields({ answers, patch }: { answers: Answers; patch: (p: Partial<Answers>) => void }) {
  return (
    <>
      <Field label="Age">
        <input inputMode="numeric" className={INPUT} value={answers.age} onChange={(e) => patch({ age: e.target.value })} />
      </Field>
      <Select label="English level" value={answers.english} values={CHOICES.english} dimension="english" onChange={(v) => patch({ english: v })} />
      <Select label="Experience" value={answers.experience} values={CHOICES.experience} dimension="experience" onChange={(v) => patch({ experience: v })} />
      <Select label="Education" value={answers.education} values={CHOICES.education} dimension="education" onChange={(v) => patch({ education: v })} />
      <Select label="Occupation skill level" value={answers.skill} values={CHOICES.skill} dimension="skill" onChange={(v) => patch({ skill: v })} />
      <Select label="Partner bonus" value={answers.partner} values={CHOICES.partner} dimension="partner" onChange={(v) => patch({ partner: v })} />
      <Field label="Annual earnings (AUD)">
        <input inputMode="numeric" className={INPUT} value={answers.earnings} onChange={(e) => patch({ earnings: e.target.value })} />
      </Field>
    </>
  )
}
