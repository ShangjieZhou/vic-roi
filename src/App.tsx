import { useEffect, useState } from 'react'
import {
  calculateVpt,
  type EducationLevel,
  type EnglishLevel,
  type SkillLevel,
  type VptInput,
} from '../supabase/functions/_shared/scoring'
import { loadSubmission, saveSubmission, type SaveOutcome } from './api'

type Answers = Partial<VptInput>
type Choice<T> = { value: T; label: string; hint?: string }

const ENGLISH: Choice<EnglishLevel>[] = [
  { value: 'competent', label: 'Competent', hint: 'IELTS 6 or equivalent' },
  { value: 'proficient', label: 'Proficient', hint: 'IELTS 7 or equivalent' },
  { value: 'superior', label: 'Superior', hint: 'IELTS 8 or equivalent' },
]
const EDUCATION: Choice<EducationLevel>[] = [
  { value: 'other', label: 'Other qualification', hint: 'Diploma, trade or other' },
  { value: 'bachelors', label: "Bachelor's or Honours" },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD' },
]
const SKILL: Choice<SkillLevel>[] = [
  { value: 1, label: 'Skill level 1', hint: 'Bachelor degree or higher (ANZSCO)' },
  { value: 2, label: 'Skill level 2', hint: 'Advanced diploma or diploma' },
  { value: 3, label: 'Skill level 3', hint: 'Certificate IV or III with experience' },
]
const PARTNER: Choice<boolean>[] = [
  { value: true, label: 'Yes, all three apply', hint: 'You claimed 10 partner skill points in your EOI, your partner is on the application, and their occupation is on the current priority list' },
  { value: false, label: 'No, or not sure', hint: 'Single, Australian partner, or the requirements are not all met' },
]

const STEPS = ['age', 'english', 'experience', 'education', 'skillLevel', 'partner', 'earnings'] as const
type Step = (typeof STEPS)[number]

const money = new Intl.NumberFormat('en-AU')

function sharedId(): string | null {
  return window.location.pathname.match(/^\/r\/([0-9a-f-]{36})$/i)?.[1] ?? null
}

export function App() {
  const [answers, setAnswers] = useState<Answers>({})
  const [step, setStep] = useState(0)
  const [input, setInput] = useState<VptInput | null>(null)
  const [save, setSave] = useState<SaveOutcome | 'saving' | null>(null)
  const [loadingShared, setLoadingShared] = useState(() => sharedId() !== null)

  useEffect(() => {
    const id = sharedId()
    if (!id) return
    loadSubmission(id).then((loaded) => {
      if (loaded) {
        setInput(loaded)
        setSave({ status: 'saved', id })
      } else {
        window.history.replaceState(null, '', '/')
      }
      setLoadingShared(false)
    })
  }, [])

  const finish = (final: VptInput) => {
    setInput(final)
    setSave('saving')
    saveSubmission(final).then((outcome) => {
      setSave(outcome)
      if (outcome.status === 'saved') window.history.replaceState(null, '', `/r/${outcome.id}`)
    })
  }

  const answer = (patch: Answers) => {
    const next = { ...answers, ...patch }
    setAnswers(next)
    if (step === STEPS.length - 1) finish(next as VptInput)
    else setStep(step + 1)
  }

  const restart = () => {
    setAnswers({})
    setStep(0)
    setInput(null)
    setSave(null)
    window.history.replaceState(null, '', '/')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-10">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-stone-900">VPT Calculator</h1>
        <span className="text-xs text-stone-500">Victoria 2026-27</span>
      </header>

      <div className="flex-1">
        {loadingShared ? (
          <p className="text-stone-500">Loading your result...</p>
        ) : input ? (
          <Results input={input} save={save} onRestart={restart} />
        ) : (
          <Question
            key={STEPS[step]}
            step={STEPS[step]}
            index={step}
            answers={answers}
            onAnswer={answer}
            onBack={step > 0 ? () => setStep(step - 1) : undefined}
          />
        )}
      </div>

      <footer className="mt-12 text-xs leading-relaxed text-stone-400">
        An unofficial estimate based on the published Victorian Points Test. It does not guarantee a nomination.
        Check the{' '}
        <a className="underline" href="https://liveinmelbourne.vic.gov.au/migrate/skilled-migration-visas/vpt">
          official page
        </a>{' '}
        before you act on a score.
      </footer>
    </main>
  )
}

function Progress({ index }: { index: number }) {
  return (
    <div className="mb-8" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
      <div className="h-1 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Step {index + 1} of {STEPS.length}
      </p>
    </div>
  )
}

function Question(props: {
  step: Step
  index: number
  answers: Answers
  onAnswer: (patch: Answers) => void
  onBack?: () => void
}) {
  const { step, index, answers, onAnswer, onBack } = props
  let body: React.ReactNode
  switch (step) {
    case 'age':
      body = (
        <NumberStep
          title="How old are you?"
          hint="Your age at the time of invitation. Points apply between 18 and 44."
          min={14} max={99} initial={answers.age} suffix="years" required
          onSubmit={(age) => onAnswer({ age })}
        />
      )
      break
    case 'english':
      body = <ChoiceStep title="What is your English level?" options={ENGLISH} onPick={(english) => onAnswer({ english })} />
      break
    case 'experience':
      body = (
        <NumberStep
          title="How many years of experience do you have in your nominated occupation?"
          hint="Whole years of skilled employment. Enter 0 if none."
          min={0} max={60} initial={answers.experienceYears} suffix="years" required
          onSubmit={(experienceYears) => onAnswer({ experienceYears })}
        />
      )
      break
    case 'education':
      body = <ChoiceStep title="What is your highest education level?" options={EDUCATION} onPick={(education) => onAnswer({ education })} />
      break
    case 'skillLevel':
      body = <ChoiceStep title="What is the skill level of your nominated occupation?" options={SKILL} onPick={(skillLevel) => onAnswer({ skillLevel })} />
      break
    case 'partner':
      body = <ChoiceStep title="Does your partner earn you partner skill points?" options={PARTNER} onPick={(partnerQualifies) => onAnswer({ partnerQualifies })} />
      break
    case 'earnings':
      body = (
        <NumberStep
          title="What is your annual earnings from current skilled employment in Victoria?"
          hint="Before tax, in AUD. Points start at $80,000. Leave blank or enter 0 if this does not apply."
          min={0} max={10_000_000} initial={answers.annualEarnings} prefix="$" step={1000}
          onSubmit={(annualEarnings) => onAnswer({ annualEarnings })}
          submitLabel="See my score"
        />
      )
      break
  }
  return (
    <section>
      <Progress index={index} />
      {body}
      {onBack && (
        <button onClick={onBack} className="mt-8 text-sm text-stone-500 hover:text-stone-900">
          Back
        </button>
      )}
    </section>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-2xl leading-snug font-semibold tracking-tight">{children}</h2>
}

function ChoiceStep<T extends string | number | boolean>(props: {
  title: string
  options: Choice<T>[]
  onPick: (value: T) => void
}) {
  return (
    <>
      <Title>{props.title}</Title>
      <div className="grid gap-3">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => props.onPick(o.value)}
            className="rounded-xl border border-stone-200 bg-white px-5 py-4 text-left transition hover:border-accent hover:shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="block font-medium">{o.label}</span>
            {o.hint && <span className="mt-0.5 block text-sm text-stone-500">{o.hint}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

function NumberStep(props: {
  title: string
  hint: string
  min: number
  max: number
  initial?: number
  prefix?: string
  suffix?: string
  step?: number
  required?: boolean
  submitLabel?: string
  onSubmit: (value: number) => void
}) {
  const [text, setText] = useState(props.initial !== undefined ? String(props.initial) : '')
  const value = text === '' ? (props.required ? NaN : 0) : Number(text)
  const valid = Number.isInteger(value) && value >= props.min && value <= props.max

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) props.onSubmit(value)
      }}
    >
      <Title>{props.title}</Title>
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-4 focus-within:border-accent">
        {props.prefix && <span className="text-stone-400">{props.prefix}</span>}
        <input
          autoFocus
          inputMode="numeric"
          type="number"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full bg-transparent text-xl outline-none"
          aria-label={props.title}
        />
        {props.suffix && <span className="text-stone-400">{props.suffix}</span>}
      </div>
      <p className="mt-3 text-sm text-stone-500">{props.hint}</p>
      <button
        type="submit"
        disabled={!valid}
        className="mt-6 w-full rounded-xl bg-accent px-5 py-3 font-medium text-white transition enabled:hover:opacity-90 disabled:opacity-40"
      >
        {props.submitLabel ?? 'Continue'}
      </button>
    </form>
  )
}

function Results(props: { input: VptInput; save: SaveOutcome | 'saving' | null; onRestart: () => void }) {
  const result = calculateVpt(props.input)
  const earningsNote =
    props.input.annualEarnings > 0 ? `$${money.format(props.input.annualEarnings)} a year` : 'Not claimed'

  return (
    <section>
      <p className="text-sm text-stone-500">Your estimated Victorian Points Test score</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-7xl font-semibold tracking-tight">{result.total}</span>
        <span className="text-lg text-stone-400">of {result.max}</span>
      </p>

      <ul className="mt-10 grid gap-5">
        {result.categories.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{c.label}</span>
              <span className="tabular-nums text-stone-500">
                {c.points} <span className="text-stone-300">/ {c.max}</span>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(c.points / c.max) * 100}%` }}
              />
            </div>
            {c.key === 'earnings' && <p className="mt-1 text-xs text-stone-400">{earningsNote}</p>}
          </li>
        ))}
      </ul>

      <SaveStatus save={props.save} />

      <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white/60 p-5">
        <p className="font-medium">Insights and comparison</p>
        <p className="mt-1 text-sm text-stone-500">
          See your percentile against other candidates and which categories would move your score most. Coming soon.
        </p>
      </div>

      <button
        onClick={props.onRestart}
        className="mt-8 w-full rounded-xl border border-stone-300 px-5 py-3 font-medium transition hover:bg-white"
      >
        Start over
      </button>
    </section>
  )
}

function SaveStatus({ save }: { save: SaveOutcome | 'saving' | null }) {
  const [copied, setCopied] = useState(false)
  if (save === null) return null
  if (save === 'saving') return <p className="mt-8 text-sm text-stone-400">Saving...</p>
  if (save.status === 'saved') {
    return (
      <div className="mt-8 flex items-center justify-between gap-4 rounded-xl bg-white px-5 py-4 text-sm">
        <span className="text-stone-500">Saved. Keep this link to return to your result.</span>
        <button
          className="font-medium text-accent"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    )
  }
  if (save.status === 'rate_limited') {
    const minutes = Math.max(1, Math.ceil(save.retryAfter / 60))
    return (
      <p className="mt-8 rounded-xl bg-amber-50 px-5 py-4 text-sm text-amber-900">
        You have saved several results recently. This score is not saved and has no shareable link. Try saving again in about {minutes} minute{minutes === 1 ? '' : 's'}.
      </p>
    )
  }
  return <p className="mt-8 text-sm text-stone-400">This result could not be saved, but your score above is correct.</p>
}
