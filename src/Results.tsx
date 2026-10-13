import { useEffect, useRef, useState } from 'react'
import {
  assess,
  improvementLevers,
  isRanked,
  MIN_OVERALL,
  type Insights,
  type Tone,
} from '../supabase/functions/_shared/insights'
import {
  calculateRange,
  calculateVpt,
  resolveDraft,
  unsureFields,
  type SkillLevel,
  type VptDraft,
  type VptInput,
  type VptResult,
} from '../supabase/functions/_shared/scoring'
import { submitScore, suggestOccupations, type Submission } from './api'
import { money } from './format'
import { CheckIcon, LockIcon } from './icons'
import { useI18n, type Key } from './i18n'
import { PartnerRequirements } from './PartnerRequirements'

const TONE: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-900',
  indigo: 'bg-indigo-50 text-indigo-900',
  amber: 'bg-amber-50 text-amber-900',
  stone: 'bg-stone-100 text-stone-700',
}

export function Results(props: {
  draft: VptDraft
  submission: Submission | null
  onRefine: (patch: Partial<VptDraft>) => void
  onRefresh: () => Promise<void>
  onSubmitted: (s: Submission) => void
  onRestart: () => void
}) {
  const { t } = useI18n()
  const { draft } = props
  const { low, high, exact } = calculateRange(draft)
  const resolved = resolveDraft(draft)
  const earningsNote =
    draft.annualEarnings > 0 ? t('res.perYear', { amount: money.format(draft.annualEarnings) }) : t('res.notClaimed')

  return (
    <section>
      <p className="text-sm text-stone-500">{t(exact ? 'res.title' : 'res.titleRange')}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-7xl font-semibold tracking-tight">
          {exact ? low.total : `${low.total}-${high.total}`}
        </span>
        <span className="text-lg text-stone-400">{t('res.of', { max: high.max })}</span>
      </p>
      {draft.location === 'offshore' && <p className="mt-1 text-xs text-stone-400">{t('res.offshore')}</p>}

      <ul className="mt-10 grid gap-5">
        {low.categories.map((c, i) => {
          const top = high.categories[i].points
          const label = t(`cat.${c.key}` as Key)
          if (!c.applicable) {
            return (
              <li key={c.key} className="flex items-baseline justify-between text-sm text-stone-400">
                <span>{label}</span>
                <span>{t('res.notApplicable')}</span>
              </li>
            )
          }
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-stone-500">
                  {c.points === top ? c.points : t('res.to', { a: c.points, b: top })}{' '}
                  <span className="text-stone-300">/ {c.max}</span>
                </span>
              </div>
              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                {top > c.points && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-indigo-200"
                    style={{ width: `${(top / c.max) * 100}%` }}
                  />
                )}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${(c.points / c.max) * 100}%` }}
                />
              </div>
              {c.key === 'earnings' && <p className="mt-1 text-xs text-stone-400">{earningsNote}</p>}
            </li>
          )
        })}
      </ul>

      {props.submission && resolved ? (
        <InsightsPanel
          input={resolved}
          result={calculateVpt(resolved)}
          submission={props.submission}
          onRefresh={props.onRefresh}
        />
      ) : resolved ? (
        <SubmitCard input={resolved} onSubmitted={props.onSubmitted} />
      ) : (
        <RefineCard draft={draft} onRefine={props.onRefine} />
      )}

      <button
        onClick={props.onRestart}
        className="mt-8 min-h-14 w-full rounded-xl border border-stone-300 px-5 py-3 font-medium transition hover:bg-white active:bg-white"
      >
        {t('res.startOver')}
      </button>
    </section>
  )
}

const SKILL_OPTIONS: { value: SkillLevel; label: Key }[] = [
  { value: 1, label: 'refine.skill.1' },
  { value: 2, label: 'refine.skill.2' },
  { value: 3, label: 'refine.skill.3' },
]

// Shown while an answer is skipped. The pool only accepts exact scores, so ranges cannot be submitted.
function RefineCard(props: { draft: VptDraft; onRefine: (patch: Partial<VptDraft>) => void }) {
  const { t } = useI18n()
  const unsure = unsureFields(props.draft)
  return (
    <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="text-lg font-semibold tracking-tight">{t('refine.title')}</h3>
      <p className="mt-1 text-sm text-stone-500">{t('refine.body', { count: unsure.length })}</p>

      {unsure.includes('skillLevel') && (
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">{t('refine.skillLegend')}</legend>
          <div className="mt-2 grid gap-2">
            {SKILL_OPTIONS.map((o) => (
              <RefineButton key={o.value} onClick={() => props.onRefine({ skillLevel: o.value })}>
                {t(o.label)}
              </RefineButton>
            ))}
          </div>
        </fieldset>
      )}

      {unsure.includes('partnerQualifies') && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">{t('q.partner.title')}</legend>
          <PartnerRequirements />
          <div className="grid gap-2">
            <RefineButton onClick={() => props.onRefine({ partnerQualifies: true })}>{t('opt.partner.yes')}</RefineButton>
            <RefineButton onClick={() => props.onRefine({ partnerQualifies: false })}>{t('opt.partner.no')}</RefineButton>
          </div>
        </fieldset>
      )}
    </div>
  )
}

function RefineButton(props: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className="min-h-12 rounded-xl border border-stone-200 px-4 py-2 text-left text-sm transition hover:border-accent active:border-accent active:bg-indigo-50"
    >
      {props.children}
    </button>
  )
}

type Notice = { key: Key; params?: Record<string, string | number> }

const BENEFITS: Key[] = ['submit.benefit1', 'submit.benefit2', 'submit.benefit3', 'submit.benefit4']

function SubmitCard(props: { input: VptInput; onSubmitted: (s: Submission) => void }) {
  const { t } = useI18n()
  const [occupation, setOccupation] = useState('')
  const [suggestions, setSuggestions] = useState<{ name: string; count: number }[]>([])
  // Stored as a key so the message follows the language toggle.
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const picked = useRef(false)

  useEffect(() => {
    if (picked.current) {
      picked.current = false
      return
    }
    if (occupation.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => suggestOccupations(occupation).then(setSuggestions), 250)
    return () => clearTimeout(timer)
  }, [occupation])

  const submit = async () => {
    setBusy(true)
    setNotice(null)
    const outcome = await submitScore(props.input, occupation)
    setBusy(false)
    if (outcome.status === 'ok') return props.onSubmitted(outcome.submission)
    if (outcome.status === 'rate_limited') {
      setNotice({ key: 'submit.rate', params: { minutes: Math.max(1, Math.ceil(outcome.retryAfter / 60)) } })
    } else if (outcome.status === 'invalid_occupation') {
      setNotice({ key: 'submit.invalidOcc' })
    } else {
      setNotice({ key: 'submit.error' })
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold tracking-tight">{t('submit.title')}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
          <LockIcon className="size-3" />
          {t('anon.badge')}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{t('submit.body')}</p>

      <div className="mt-4 rounded-xl bg-indigo-50 p-4">
        <p className="text-sm font-medium text-indigo-950">{t('submit.benefitsTitle')}</p>
        <ul className="mt-2 grid gap-2">
          {BENEFITS.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm leading-snug text-indigo-950">
              <CheckIcon className="mt-0.5 size-4 text-accent" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>

      <label className="mt-5 block text-sm font-medium" htmlFor="occupation">
        {t('submit.occLabel')} <span className="font-normal text-stone-400">{t('submit.optional')}</span>
      </label>
      <p className="mt-0.5 text-xs text-stone-500">{t('submit.occHint')}</p>
      <input
        id="occupation"
        type="text"
        value={occupation}
        maxLength={80}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        placeholder={t('submit.placeholder')}
        onChange={(e) => setOccupation(e.target.value)}
        className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-base outline-none focus:border-accent"
      />
      {suggestions.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button
                onClick={() => {
                  picked.current = true
                  setOccupation(s.name)
                  setSuggestions([])
                }}
                className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm active:bg-stone-100"
              >
                <span>{s.name}</span>
                <span className="text-xs text-stone-400">{t('submit.suggestCount', { n: s.count })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t(notice.key, notice.params)}</p>
      )}

      <p className="mt-5 flex items-start gap-1.5 text-xs leading-relaxed text-stone-500">
        <LockIcon className="mt-0.5 size-3.5 text-emerald-700" />
        <span>{t('submit.anonDetail')}</span>
      </p>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 min-h-14 w-full rounded-xl bg-accent px-5 py-3 text-base font-medium text-white transition enabled:hover:opacity-90 enabled:active:opacity-80 disabled:opacity-60"
      >
        {busy ? t('submit.busy') : t('submit.cta')}
      </button>
      <p className="mt-3 text-center text-xs leading-relaxed text-stone-400">{t('submit.note', { min: MIN_OVERALL })}</p>
    </div>
  )
}

function InsightsPanel(props: {
  input: VptInput
  result: VptResult
  submission: Submission
  onRefresh: () => Promise<void>
}) {
  const { t, td } = useI18n()
  const { insights } = props.submission
  const assessment = assess(insights)
  const levers = improvementLevers(props.input)
  const { overall, occupation } = insights

  return (
    <div className="mt-10 grid gap-8">
      {isRanked(overall) ? (
        <div className={`rounded-2xl p-5 ${TONE[assessment.tone]}`}>
          <p className="text-xs font-medium tracking-wide uppercase opacity-70">
            {t('ins.heading', { loc: t(`loc.${insights.location}` as Key) })}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{td(assessment.label)}</p>
          {assessment.lines.map((line, i) => (
            <p key={`${line.id}-${i}`} className="mt-2 text-sm leading-relaxed">
              {td(line)}
            </p>
          ))}
        </div>
      ) : (
        <WaitingCard insights={insights} onRefresh={props.onRefresh} />
      )}

      {isRanked(overall) && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t('ins.overall')} value={t('ins.top', { p: Math.max(1, 100 - overall.percentile) })} />
          <Stat
            label={t('ins.yourOcc')}
            value={isRanked(occupation) ? t('ins.top', { p: Math.max(1, 100 - occupation.percentile) }) : t('ins.na')}
          />
          <Stat label={t('ins.median')} value={String(overall.median)} />
        </div>
      )}

      {isRanked(overall) && overall.histogram && overall.histogram.length > 0 && (
        <Distribution histogram={overall.histogram} total={insights.total} p25={overall.p25} p75={overall.p75} />
      )}

      {overall.categoryAvg && (
        <CategoryCompare result={props.result} avg={overall.categoryAvg} percentile={overall.categoryPercentile} />
      )}

      {levers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{t('ins.leversTitle')}</h3>
          <ul className="mt-3 grid gap-2">
            {levers.map((l) => (
              <li key={l.label.id} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 text-sm">
                <span>{td(l.label)}</span>
                <span className="shrink-0 font-semibold text-accent">+{l.gain}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ShareLink />

      <p className="text-xs leading-relaxed text-stone-400">{t('ins.disclaimer')}</p>
    </div>
  )
}

// Shown right after submitting while the pool is below the minimum. The result is already saved, so the
// candidate can leave and come back to the same link, or check again here.
function WaitingCard(props: { insights: Insights; onRefresh: () => Promise<void> }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<'idle' | 'checking' | 'done'>('idle')
  const check = async () => {
    setStatus('checking')
    await props.onRefresh()
    // If the pool is now large enough this card unmounts, so reaching 'done' means still waiting.
    setStatus('done')
  }
  return (
    <div className="rounded-2xl bg-stone-100 p-5 text-stone-800">
      <p className="text-2xl font-semibold tracking-tight">{t('wait.title')}</p>
      <p className="mt-2 text-sm leading-relaxed">
        {t('wait.body', {
          min: MIN_OVERALL,
          n: props.insights.overall.n,
          loc: t(`loc.${props.insights.location}` as Key),
        })}
      </p>
      <p className="mt-2 text-sm leading-relaxed">{t('wait.stay')}</p>
      <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-emerald-800">
        <LockIcon className="mt-0.5 size-4" />
        <span>{t('wait.anon')}</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">{t('wait.device')}</p>
      <button
        onClick={check}
        disabled={status === 'checking'}
        className="mt-4 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium transition enabled:active:bg-stone-50 disabled:opacity-60"
      >
        {status === 'checking' ? t('wait.checking') : t('wait.check')}
      </button>
      {status === 'done' && <p className="mt-3 text-sm text-stone-500">{t('wait.stillWaiting')}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-2 py-3">
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{label}</p>
    </div>
  )
}

function Distribution(props: {
  histogram: NonNullable<Insights['overall']['histogram']>
  total: number
  p25?: number
  p75?: number
}) {
  const { t } = useI18n()
  const yourBin = Math.min(Math.floor(props.total / 50), 18)
  const counts = new Map(props.histogram.map((b) => [b.from / 50, b.count]))
  const lo = Math.min(yourBin, ...counts.keys())
  const hi = Math.max(yourBin, ...counts.keys())
  const bins = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  const peak = Math.max(1, ...counts.values())

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{t('ins.distTitle')}</h3>
      <div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label={t('ins.distAria')}>
        {bins.map((b) => {
          const count = counts.get(b) ?? 0
          return (
            <div
              key={b}
              className={`flex-1 rounded-t ${b === yourBin ? 'bg-accent' : 'bg-stone-300'}`}
              style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-400">
        <span>{lo * 50}</span>
        <span>{(hi + 1) * 50}</span>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {t('ins.distNote')}
        {props.p25 !== undefined && props.p75 !== undefined && t('ins.distIqr', { p25: props.p25, p75: props.p75 })}
      </p>
    </div>
  )
}

function CategoryCompare(props: {
  result: VptResult
  avg: NonNullable<Insights['overall']['categoryAvg']>
  percentile?: Insights['overall']['categoryPercentile']
}) {
  const { t } = useI18n()
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{t('ins.cmpTitle')}</h3>
      <ul className="mt-4 grid gap-4">
        {props.result.categories.filter((c) => c.applicable).map((c) => {
          const avg = props.avg[c.key] ?? 0
          const delta = Math.round(c.points - avg)
          const pct = props.percentile?.[c.key]
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{t(`cat.${c.key}` as Key)}</span>
                <span className="shrink-0 tabular-nums text-stone-500">
                  {t('ins.cmpVs', { a: c.points, b: Math.round(avg) })}{' '}
                  <span className={delta >= 0 ? 'text-emerald-600' : 'text-amber-600'}>
                    ({delta >= 0 ? '+' : ''}
                    {delta})
                  </span>
                </span>
              </div>
              <div className="relative mt-2 h-2 rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(c.points / c.max) * 100}%` }} />
                <div
                  className="absolute -top-1 h-4 w-0.5 rounded bg-stone-900"
                  style={{ left: `${Math.min(100, (avg / c.max) * 100)}%` }}
                  title={t('ins.avg')}
                />
              </div>
              {pct !== undefined && <p className="mt-1.5 text-xs font-medium text-stone-500">{t('ins.pct', { p: pct })}</p>}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-stone-500">{t('ins.cmpNote')}</p>
      {props.percentile && <p className="mt-1 text-xs leading-relaxed text-stone-500">{t('ins.pctNote')}</p>}
    </div>
  )
}

function ShareLink() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-5 py-3 text-sm">
      <span className="text-stone-500">{t('ins.keepLink')}</span>
      <button
        className="-mr-2 min-h-12 shrink-0 px-2 font-medium text-accent active:opacity-60"
        onClick={() => {
          const url = window.location.href
          if (canShare) {
            navigator.share({ title: t('ins.shareTitle'), url }).catch(() => {})
            return
          }
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? t('ins.copied') : canShare ? t('ins.share') : t('ins.copyLink')}
      </button>
    </div>
  )
}
