import { useState } from 'react'
import type { Insights } from '../../supabase/functions/_shared/insights'
import { calculateVpt, type VptResult } from '../../supabase/functions/_shared/scoring'
import type { OccupationChoice } from '../api'
import { useI18n } from '../i18n'
import { OccupationPicker } from '../OccupationPicker'
import { AnalysisView } from '../Results'
import { isRanked } from '../../supabase/functions/_shared/insights'
import { AnswerFields, CHOICES, Field, Select, defaultAnswers, inputFrom, type Answers } from './AnswerFields'
import { simulateRanking, type SimulateRequest } from './types'
import { BTN, CARD, INPUT, Problem, TITLE } from './ui'

type Mode = 'score' | 'form'

interface FormState extends Answers {
  score: string
}

const start: FormState = { ...defaultAnswers, score: '' }

// The third page: where a score would land among the stored submissions, shown with the same analysis the
// candidates see. Nothing is saved.
export function Simulator(props: { token: string; onExpired: () => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('score')
  const [form, setForm] = useState<FormState>(start)
  const [occupation, setOccupation] = useState<OccupationChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [shown, setShown] = useState<{ insights: Insights; result?: VptResult; total: number } | null>(null)
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  const run = async () => {
    setError(null)
    setProblem(null)
    const occupationCode = occupation?.kind === 'listed' ? occupation.code : undefined
    let request: SimulateRequest
    let result: VptResult | undefined
    let total: number
    if (mode === 'score') {
      total = Number(form.score)
      if (form.score.trim() === '' || !Number.isInteger(total) || total < 0 || total > 950) {
        return setError('Enter a whole score from 0 to 950.')
      }
      request = { mode: 'score', total, location: form.location as 'onshore' | 'offshore', occupationCode }
    } else {
      const input = inputFrom(form)
      if (!input) return setError('Check the answers: age and earnings must be whole numbers in range.')
      result = calculateVpt(input)
      total = result.total
      request = { mode: 'form', input: input as unknown as Record<string, unknown>, occupationCode }
    }
    setBusy(true)
    const out = await simulateRanking(props.token, request)
    setBusy(false)
    if (out.status === 'ok') return setShown({ insights: out.data.insights, result, total })
    if (out.status === 'signed_out') return props.onExpired()
    setProblem(out.status)
  }

  const earningsNote =
    form.location === 'offshore' ? t('res.offshoreZero') : Number(form.earnings) > 0 ? t('res.perYear', { amount: Number(form.earnings).toLocaleString('en-AU') }) : t('res.notClaimed')

  return (
    <div className="grid gap-5">
      <form
        className={CARD}
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <h2 className={TITLE}>Ranking simulator</h2>
        <p className="mt-0.5 mb-4 text-xs text-stone-500">See where a score would rank among the stored submissions. The candidate is not saved.</p>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Input mode">
          {(['score', 'form'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-full border px-3 text-sm ${mode === m ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
            >
              {m === 'score' ? 'A single score' : 'The full form'}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mode === 'score' ? (
            <Field label="Total score (0 to 950)">
              <input aria-label="Total score" inputMode="numeric" className={INPUT} value={form.score} onChange={(e) => patch({ score: e.target.value })} placeholder="For example 640" />
            </Field>
          ) : (
            <AnswerFields answers={form} patch={patch} />
          )}
          <Select label="Location" value={form.location} values={CHOICES.location} dimension="location" onChange={(v) => patch({ location: v })} />
        </div>

        <div className="mt-4">
          <span className="text-sm font-medium">Occupation (optional)</span>
          <div className="mt-1 max-w-xl">
            <OccupationPicker value={occupation} onChange={setOccupation} />
          </div>
          {occupation?.kind === 'free' && (
            <p className="mt-1 text-xs text-amber-800">Only occupations from the list can be compared. This one is ignored.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Working...' : 'Show ranking'}
          </button>
          {shown && (
            <button type="button" className={BTN} onClick={() => setShown(null)}>
              Clear result
            </button>
          )}
        </div>
      </form>

      {problem && <Problem status={problem} />}

      {shown && (
        <section>
          <p className="text-sm text-stone-500">Simulated score</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-6xl font-semibold tracking-tight">{shown.total}</span>
            <span className="text-lg text-stone-400">of 950</span>
          </p>
          {isRanked(shown.insights.overall) ? (
            <div className="mt-8 grid gap-8 [&>*]:min-w-0">
              <AnalysisView insights={shown.insights} result={shown.result} earningsNote={earningsNote} />
            </div>
          ) : (
            <p className="mt-6 text-sm text-stone-600">Fewer than 10 submissions are stored, so there is nothing to compare with yet.</p>
          )}
          {!shown.result && (
            <p className="mt-6 text-xs text-stone-500">A single score has no section breakdown. Use the full form to see the section charts.</p>
          )}
        </section>
      )}
    </div>
  )
}
