import { useCallback, useEffect, useState } from 'react'
import type {
  EducationLevel,
  EnglishLevel,
  SkillLevel,
  VptDraft,
} from '../supabase/functions/_shared/scoring'
import { EARNINGS_INPUT_MAX } from '../supabase/functions/_shared/scoring'
import { loadSubmission, type Submission } from './api'
import { money } from './format'
import { EnglishRequirementsLink } from './EnglishRequirements'
import { HistoryList } from './History'
import { useI18n, type Key, type Lang } from './i18n'
import { PartnerRequirements } from './PartnerRequirements'
import { Results } from './Results'
import { addToHistory, loadHistory, removeFromHistory, type HistoryEntry } from './saved'

type Answers = Partial<VptDraft>
type Choice<T> = { value: T; label: Key; hint?: Key }

const ENGLISH: Choice<EnglishLevel>[] = [
  { value: 'competent', label: 'opt.english.competent', hint: 'opt.english.competent.hint' },
  { value: 'proficient', label: 'opt.english.proficient', hint: 'opt.english.proficient.hint' },
  { value: 'superior', label: 'opt.english.superior', hint: 'opt.english.superior.hint' },
]
// Values are band codes, not literal years: 0 none, 1 under 1 year, 2 for 1 to 3, 4 for 3 to 5, 6 for 6 to 8, 9 for more than 8.
const EXPERIENCE: Choice<number>[] = [
  { value: 0, label: 'opt.exp.0' },
  { value: 1, label: 'opt.exp.1' },
  { value: 2, label: 'opt.exp.2' },
  { value: 4, label: 'opt.exp.4' },
  { value: 6, label: 'opt.exp.6' },
  { value: 9, label: 'opt.exp.9' },
]
const EDUCATION: Choice<EducationLevel>[] = [
  { value: 'other', label: 'opt.edu.other', hint: 'opt.edu.other.hint' },
  { value: 'bachelors', label: 'opt.edu.bachelors' },
  { value: 'masters', label: 'opt.edu.masters' },
  { value: 'phd', label: 'opt.edu.phd' },
]
const SKILL: Choice<SkillLevel | 'unsure'>[] = [
  { value: 1, label: 'opt.skill.1', hint: 'opt.skill.1.hint' },
  { value: 2, label: 'opt.skill.2', hint: 'opt.skill.2.hint' },
  { value: 3, label: 'opt.skill.3', hint: 'opt.skill.3.hint' },
  { value: 'unsure', label: 'opt.unsure', hint: 'opt.unsure.hint' },
]
const PARTNER: Choice<boolean | 'unsure'>[] = [
  { value: true, label: 'opt.partner.yes', hint: 'opt.partner.yes.hint' },
  { value: false, label: 'opt.partner.no' },
  { value: 'unsure', label: 'opt.unsure', hint: 'opt.unsure.hint' },
]

const STEPS = ['age', 'english', 'experience', 'education', 'skillLevel', 'partner', 'earnings'] as const
type Step = (typeof STEPS)[number]

function sharedId(): string | null {
  return window.location.pathname.match(/^\/r\/([0-9a-f-]{36})$/i)?.[1] ?? null
}

// Moves to a path with a real history entry, so the browser Back button returns to where the visitor was.
function go(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
}

export function App() {
  const { t } = useI18n()
  const [answers, setAnswers] = useState<Answers>({})
  const [step, setStep] = useState(0)
  const [input, setInput] = useState<VptDraft | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loadingShared, setLoadingShared] = useState(() => sharedId() !== null)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)

  const resetWizard = () => {
    setAnswers({})
    setStep(0)
    setInput(null)
    setSubmission(null)
  }

  // Opens a stored result by id. A result the server no longer has is dropped from the history.
  const showResult = useCallback((id: string) => {
    setLoadingShared(true)
    setInput(null)
    setSubmission(null)
    loadSubmission(id).then((loaded) => {
      if (loaded && loaded !== 'not_found') {
        setInput(loaded.input)
        setSubmission(loaded.submission)
      } else {
        if (loaded === 'not_found') setHistory(removeFromHistory(id))
        window.history.replaceState(null, '', '/')
      }
      setLoadingShared(false)
    })
  }, [])

  useEffect(() => {
    const id = sharedId()
    if (id) showResult(id)
    // Back and Forward move between the home screen and individual results.
    const onPop = () => {
      const popped = sharedId()
      if (popped) {
        showResult(popped)
      } else {
        resetWizard()
        setLoadingShared(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [showResult])

  const answer = (patch: Answers) => {
    const next = { ...answers, ...patch }
    setAnswers(next)
    // Location is only known from the last answer, so anyone who does not pick offshore there is onshore.
    if (step === STEPS.length - 1) setInput({ ...next, location: next.location ?? 'onshore' } as VptDraft)
    else setStep(step + 1)
  }

  // replaced lists any earlier submission this one withdrew. It is gone from the server, so it leaves the list too.
  const submitted = (s: Submission, replaced: string[]) => {
    setSubmission(s)
    go(`/r/${s.id}`)
    for (const id of replaced) removeFromHistory(id)
    setHistory(
      addToHistory({
        id: s.id,
        total: s.insights.total,
        location: s.insights.location,
        occupation: s.occupation,
        occupationCode: s.occupationCode,
        savedAt: Date.now(),
      }),
    )
  }

  // Re-reads the result so analysis appears once the pool is large enough, without a page reload.
  const refreshInsights = async () => {
    if (!submission) return
    const loaded = await loadSubmission(submission.id)
    if (loaded && loaded !== 'not_found') setSubmission(loaded.submission)
  }

  const goHome = () => {
    go('/')
    resetWizard()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-stone-900">{t('app.title')}</h1>
          <p className="mt-0.5 text-xs text-stone-500">{t('app.edition')}</p>
        </div>
        <LangToggle />
      </header>

      <div className="flex-1">
        {loadingShared ? (
          <p className="text-stone-500">{t('app.loading')}</p>
        ) : input ? (
          <>
            {submission && history.length > 0 && (
              <button
                onClick={goHome}
                className="-ml-3 mb-2 inline-flex min-h-11 items-center px-3 text-sm font-medium text-accent active:opacity-60"
              >
                ‹ {t('hist.back')}
              </button>
            )}
            <Results
              draft={input}
              submission={submission}
              onRefine={(patch) => setInput({ ...input, ...patch })}
              onRefresh={refreshInsights}
              onSubmitted={submitted}
              onOpen={(id) => {
                go(`/r/${id}`)
                showResult(id)
              }}
              onRestart={goHome}
            />
          </>
        ) : (
          <>
            <Question
              key={STEPS[step]}
              step={STEPS[step]}
              index={step}
              total={STEPS.length}
              answers={answers}
              onAnswer={answer}
              onBack={step > 0 ? () => setStep(step - 1) : undefined}
            />
            {step === 0 && history.length > 0 && (
              <HistoryList
                entries={history}
                onOpen={(id) => {
                  go(`/r/${id}`)
                  showResult(id)
                }}
              />
            )}
          </>
        )}
      </div>

      <footer className="mt-12 text-xs leading-relaxed text-stone-400">
        {t('footer.before')}
        <a className="underline" href="https://liveinmelbourne.vic.gov.au/migrate/skilled-migration-visas/vpt">
          {t('footer.link')}
        </a>
        {t('footer.after')}
      </footer>
    </main>
  )
}

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

// Both languages are always visible, so a visitor can find theirs whichever the page is currently in.
function LangToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('lang.label')} className="flex shrink-0 rounded-full bg-stone-200/70 p-0.5 text-xs">
      {LANGUAGES.map((o) => (
        <button
          key={o.value}
          aria-pressed={lang === o.value}
          onClick={() => setLang(o.value)}
          className={`min-h-10 rounded-full px-3.5 font-medium transition ${
            lang === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 active:text-stone-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Progress({ index, total }: { index: number; total: number }) {
  const { t } = useI18n()
  const label = t('progress.step', { n: index + 1, total })
  return (
    <div className="mb-8" aria-label={label}>
      <div className="h-1 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-stone-500">{label}</p>
    </div>
  )
}

function Question(props: {
  step: Step
  index: number
  total: number
  answers: Answers
  onAnswer: (patch: Answers) => void
  onBack?: () => void
}) {
  const { step, index, total, answers, onAnswer, onBack } = props
  const { t } = useI18n()
  // Braces matter: an effect that returns a value makes React treat it as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  let body: React.ReactNode
  switch (step) {
    case 'age':
      body = (
        <NumberStep
          title={t('q.age.title')}
          hint={t('q.age.hint')}
          min={14} max={99} initial={answers.age} suffix={t('unit.years')} required
          onSubmit={(age) => onAnswer({ age })}
        />
      )
      break
    case 'english':
      body = (
        <ChoiceStep
          title={t('q.english.title')}
          intro={<EnglishRequirementsLink initial={answers.english} />}
          options={ENGLISH}
          onPick={(english) => onAnswer({ english })}
        />
      )
      break
    case 'experience':
      body = (
        <ChoiceStep
          title={t('q.exp.title')}
          options={EXPERIENCE}
          onPick={(experienceYears) => onAnswer({ experienceYears })}
        />
      )
      break
    case 'education':
      body = <ChoiceStep title={t('q.edu.title')} options={EDUCATION} onPick={(education) => onAnswer({ education })} />
      break
    case 'skillLevel':
      body = <ChoiceStep title={t('q.skill.title')} options={SKILL} onPick={(skillLevel) => onAnswer({ skillLevel })} />
      break
    case 'partner':
      body = (
        <ChoiceStep
          title={t('q.partner.title')}
          intro={<PartnerRequirements />}
          options={PARTNER}
          onPick={(partnerQualifies) => onAnswer({ partnerQualifies })}
        />
      )
      break
    case 'earnings':
      body = (
        <NumberStep
          title={t('q.earn.title')}
          hint={t('q.earn.hint')}
          min={0} max={EARNINGS_INPUT_MAX} initial={answers.annualEarnings} prefix="$" required
          // The offshore option sits above the field. Skipping autofocus keeps the keyboard from hiding it.
          autoFocus={false}
          onSubmit={(annualEarnings) => onAnswer({ annualEarnings, location: 'onshore' })}
          submitLabel={t('q.earn.submit')}
          alternative={{
            label: t('q.earn.offshore'),
            hint: t('q.earn.offshore.hint'),
            onPick: () => onAnswer({ annualEarnings: 0, location: 'offshore' }),
          }}
        />
      )
      break
  }
  return (
    <section>
      <Progress index={index} total={total} />
      {body}
      {onBack && (
        <button
          onClick={onBack}
          className="mt-4 -ml-3 inline-flex min-h-12 items-center px-3 text-sm text-stone-500 active:text-stone-900"
        >
          {t('common.back')}
        </button>
      )}
    </section>
  )
}

const CARD =
  'min-h-16 rounded-xl border border-stone-200 bg-white px-5 py-4 text-left transition hover:border-accent hover:shadow-sm active:scale-[0.99] active:border-accent active:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-accent'

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-2xl leading-snug font-semibold tracking-tight">{children}</h2>
}

function ChoiceStep<T extends string | number | boolean>(props: {
  title: string
  intro?: React.ReactNode
  options: Choice<T>[]
  onPick: (value: T) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <Title>{props.title}</Title>
      {props.intro}
      <div className="grid gap-3">
        {props.options.map((o) => (
          <button key={String(o.value)} onClick={() => props.onPick(o.value)} className={CARD}>
            <span className="block font-medium">{t(o.label)}</span>
            {o.hint && <span className="mt-0.5 block text-sm text-stone-500">{t(o.hint)}</span>}
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
  required?: boolean
  submitLabel?: string
  autoFocus?: boolean
  // Shown above the field, as its own option.
  alternative?: { label: string; hint: string; onPick: () => void }
  onSubmit: (value: number) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(props.initial !== undefined ? String(props.initial) : '')
  const value = text === '' ? (props.required ? NaN : 0) : Number(text)
  const valid = Number.isInteger(value) && value >= props.min && value <= props.max
  const fmt = (n: number) => (props.prefix === '$' ? `$${money.format(n)}` : String(n))
  // Explain a number that is out of range. A number that is still too short, such as the first digit of an age,
  // is not flagged until the field has as many digits as the largest allowed value.
  const outOfRange =
    Number.isFinite(value) &&
    (value > props.max || (value < props.min && text.length >= String(props.max).length))

  return (
    <form
      // The field shows thousands separators ("100,000"). Browser pattern checks would reject that on submit,
      // so the form validates the number itself.
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) props.onSubmit(value)
      }}
    >
      <Title>{props.title}</Title>
      {props.alternative && (
        <>
          <button type="button" onClick={props.alternative.onPick} className={`${CARD} w-full`}>
            <span className="block font-medium">{props.alternative.label}</span>
            <span className="mt-0.5 block text-sm text-stone-500">{props.alternative.hint}</span>
          </button>
          <p className="my-4 text-center text-xs text-stone-400">{t('q.earn.or')}</p>
        </>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-4 focus-within:border-accent">
        {props.prefix && <span className="text-stone-400">{props.prefix}</span>}
        <input
          autoFocus={props.autoFocus ?? true}
          type="text"
          inputMode="numeric"
          enterKeyHint={props.submitLabel ? 'done' : 'next'}
          autoComplete="off"
          value={props.prefix === '$' && text !== '' ? money.format(Number(text)) : text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, String(props.max).length + 1))}
          className="min-h-8 w-full bg-transparent text-2xl outline-none"
          aria-label={props.title}
        />
        {props.suffix && <span className="text-stone-400">{props.suffix}</span>}
      </div>
      <p className="mt-3 text-sm text-stone-500">{props.hint}</p>
      {outOfRange && (
        <p role="alert" className="mt-2 text-sm text-amber-700">
          {t('q.range', { min: fmt(props.min), max: fmt(props.max) })}
        </p>
      )}
      <button
        type="submit"
        disabled={!valid}
        className="mt-6 min-h-14 w-full rounded-xl bg-accent px-5 py-3 text-base font-medium text-white transition enabled:hover:opacity-90 enabled:active:opacity-80 disabled:opacity-40"
      >
        {props.submitLabel ?? t('common.continue')}
      </button>
    </form>
  )
}
