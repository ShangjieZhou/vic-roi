import { useState } from 'react'
import {
  comparisonRows,
  isRanked,
  MIN_OVERALL,
  type ComparisonRow,
  type Insights,
  type PoolStats,
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
import { submitScore, type OccupationChoice, type Submission } from './api'
import { turnstileSiteKey } from './config'
import { money } from './format'
import { LockIcon } from './icons'
import { useI18n, type Key } from './i18n'
import { OccupationPicker } from './OccupationPicker'
import { occupationDisplayName } from './occupationSearch'
import { PartnerRequirements } from './PartnerRequirements'
import { SECTION_SCORES, medianScore, selectionFor, topPercent } from './sectionScores'
import { Turnstile } from './Turnstile'

export function Results(props: {
  draft: VptDraft
  submission: Submission | null
  onRefine: (patch: Partial<VptDraft>) => void
  onRefresh: () => Promise<void>
  // replaced lists any earlier submission from this device that the new one withdrew.
  onSubmitted: (s: Submission, replaced: string[]) => void
  onOpen: (id: string) => void
  onRestart: () => void
}) {
  const { t } = useI18n()
  const { draft } = props
  const { low, high, exact } = calculateRange(draft)
  const resolved = resolveDraft(draft)
  // Once the comparison is open, the per-section bar charts take over from the simple score bars.
  const analysisOpen = !!(props.submission && resolved && isRanked(props.submission.insights.overall))
  const earningsNote =
    draft.location === 'offshore'
      ? t('res.offshoreZero')
      : draft.annualEarnings > 0
        ? t('res.perYear', { amount: money.format(draft.annualEarnings) })
        : t('res.notClaimed')

  return (
    <section>
      <p className="text-sm text-stone-500">{t(exact ? 'res.title' : 'res.titleRange')}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-7xl font-semibold tracking-tight">
          {exact ? low.total : `${low.total}-${high.total}`}
        </span>
        <span className="text-lg text-stone-400">{t('res.of', { max: high.max })}</span>
      </p>

      {!analysisOpen && (
        <ul className="mt-10 grid gap-5">
          {low.categories.map((c, i) => {
            const top = high.categories[i].points
            return (
              <li key={c.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{t(`cat.${c.key}` as Key)}</span>
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
      )}

      {props.submission && resolved ? (
        <InsightsPanel
          input={resolved}
          result={calculateVpt(resolved)}
          submission={props.submission}
          onRefresh={props.onRefresh}
        />
      ) : resolved ? (
        <SubmitCard input={resolved} onSubmitted={props.onSubmitted} onOpen={props.onOpen} />
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

function SubmitCard(props: {
  input: VptInput
  onSubmitted: (s: Submission, replaced: string[]) => void
  onOpen: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const siteKey = turnstileSiteKey()
  const [occupation, setOccupation] = useState<OccupationChoice | null>(null)
  // Stored as a key so the message follows the language toggle.
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  // Set when this device already has a submission. The candidate must choose to withdraw it before submitting again.
  const [existing, setExisting] = useState<{ id: string; total: number } | null>(null)
  // The bot check. A token is single use, so it is replaced after any attempt that consumed it.
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [checkUnavailable, setCheckUnavailable] = useState(false)
  const checking = siteKey !== null && token === null && !checkUnavailable
  const cannotSend = busy || checking || checkUnavailable

  const send = async (replace: boolean) => {
    setBusy(true)
    setNotice(null)
    const outcome = await submitScore(props.input, occupation, { turnstileToken: token, replace })
    setBusy(false)
    if (outcome.status === 'ok') return props.onSubmitted(outcome.submission, outcome.replaced)
    // The server answers this before it checks the token, so the token is still good for the replacement.
    if (outcome.status === 'already_submitted') return setExisting(outcome.existing)
    if (outcome.status === 'bot_check_failed' || outcome.status === 'error') {
      if (siteKey) setResetKey((k) => k + 1)
    }
    if (outcome.status === 'bot_check_failed') setNotice({ key: 'submit.botFailed' })
    else if (outcome.status === 'invalid_occupation') setNotice({ key: 'submit.invalidOcc' })
    else setNotice({ key: 'submit.error' })
  }

  return (
    <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-sm font-medium">
        {t('submit.occLabel')} <span className="font-normal text-stone-400">{t('submit.optional')}</span>
      </p>
      <p className="mt-0.5 text-xs text-stone-500">{t('submit.occHint')}</p>
      <OccupationPicker value={occupation} onChange={setOccupation} />

      {checkUnavailable && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('submit.botUnavailable')}</p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{t(notice.key, notice.params)}</p>
      )}

      {existing ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">{t('withdraw.title')}</p>
          <p className="mt-1 leading-relaxed">{t('withdraw.body', { total: existing.total })}</p>
          <div className="mt-4 grid gap-2">
            <button
              onClick={() => send(true)}
              disabled={cannotSend}
              className="min-h-12 rounded-xl bg-red-700 px-4 py-2 font-medium text-white transition enabled:active:opacity-80 disabled:opacity-60"
            >
              {busy ? t('withdraw.busy') : t('withdraw.confirm')}
            </button>
            <button
              onClick={() => props.onOpen(existing.id)}
              className="min-h-12 rounded-xl border border-amber-300 bg-white px-4 py-2 font-medium active:bg-amber-100"
            >
              {t('withdraw.view')}
            </button>
            <button onClick={() => setExisting(null)} className="min-h-11 px-4 text-amber-900/80 active:text-amber-950">
              {t('withdraw.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => send(false)}
            disabled={cannotSend}
            className="mt-5 min-h-14 w-full rounded-xl bg-accent px-5 py-3 text-base font-semibold text-white transition enabled:hover:opacity-90 enabled:active:opacity-80 disabled:opacity-60"
          >
            {busy ? t('submit.busy') : t('submit.cta')}
          </button>
          {checking && <p className="mt-2 text-center text-xs text-stone-400">{t('submit.verifying')}</p>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-stone-500">
            <LockIcon className="size-3.5 text-emerald-700" />
            <span>{t('submit.anon')}</span>
          </p>
        </>
      )}

      {siteKey && (
        <Turnstile
          siteKey={siteKey}
          lang={lang}
          resetKey={resetKey}
          onToken={(value) => {
            setToken(value)
            if (value) setCheckUnavailable(false)
          }}
          onUnavailable={() => setCheckUnavailable(true)}
        />
      )}
    </div>
  )
}

function InsightsPanel(props: {
  input: VptInput
  result: VptResult
  submission: Submission
  onRefresh: () => Promise<void>
}) {
  const { t } = useI18n()
  const { insights } = props.submission
  const { overall } = insights

  return (
    <div className="mt-10 grid gap-8">
      {isRanked(overall) ? (
        <>
          <PercentileBar insights={insights} />
          <Comparison insights={insights} />
          <SectionCharts result={props.result} overall={overall} />
        </>
      ) : (
        <WaitingCard insights={insights} onRefresh={props.onRefresh} />
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
        {t('wait.body', { min: MIN_OVERALL, n: props.insights.overall.n })}
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

// The candidate's percentile in three contexts: all candidates, their occupation, and their onshore or offshore
// status. The occupation and location rows appear as soon as another candidate is in them, so the numbers can rest
// on very few people. The count is shown beside each one.
function Comparison({ insights }: { insights: Insights }) {
  const { t, lang } = useI18n()
  const rows = comparisonRows(insights)
  if (rows.length === 0) return null

  const label = (row: ComparisonRow): string => {
    switch (row.kind) {
      case 'all':
        return t('cmp.all')
      case 'location':
        return t(`cmp.${insights.location}` as Key)
      case 'occupation':
        return insights.occupation?.code
          ? occupationDisplayName(insights.occupation.code, lang)
          : (insights.occupation?.name ?? '')
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{t('cmp.title')}</h3>
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.kind} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label(row)}</span>
              <span className="block text-xs text-stone-500">{t('cmp.n', { n: row.n })}</span>
            </span>
            <span className="shrink-0 text-right">
              {row.percentile !== undefined ? (
                <span className="text-lg font-semibold tracking-tight text-accent">{t('ins.pct', { p: topPercent(row.percentile) })}</span>
              ) : (
                <span className="text-xs text-stone-500">{t('cmp.first')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Every submitted score ranked from lowest to highest, as a bar from the 0th to the 100th percentile. The
// candidate sits at their own percentile, and the median and the average are marked on the same bar.
function PercentileBar({ insights }: { insights: Insights }) {
  const { t } = useI18n()
  const { overall } = insights
  if (!isRanked(overall)) return null
  const p = overall.percentile
  const top = topPercent(p)
  const mean = overall.mean
  const meanAt = overall.meanPercentile

  return (
    <section>
      <h3 className="text-lg font-semibold tracking-tight">{t('rank.title')}</h3>
      <p className="mt-0.5 text-sm text-stone-500">{t('rank.among', { n: overall.n })}</p>

      <div
        className="relative mt-11 mb-2 h-3 rounded-full bg-stone-200"
        role="img"
        aria-label={t('rank.youAt', { p: top })}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-200" style={{ width: `${p}%` }} />
        {/* The median is the 50th percentile by definition. */}
        <Tick at={50} className="bg-stone-900" />
        {meanAt !== undefined && <Tick at={meanAt} className="bg-amber-500" />}
        <div
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
          style={{ left: `${p}%` }}
        />
        <div
          className="absolute -top-9 -translate-x-1/2 rounded-md bg-accent px-2 py-1 text-xs font-medium whitespace-nowrap text-white"
          style={{ left: `clamp(3rem, ${p}%, calc(100% - 3rem))` }}
        >
          {t('rank.youAt', { p: top })}
        </div>
      </div>
      <div className="flex justify-between text-xs text-stone-400">
        <span>{t('rank.low')}</span>
        <span>{t('rank.high')}</span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat label={t('rank.score')} value={String(insights.total)} swatch="bg-accent" highlight />
        <Stat label={t('rank.median')} value={String(overall.median)} swatch="bg-stone-900" />
        <Stat label={t('rank.average')} value={mean === undefined ? '-' : String(mean)} swatch="bg-amber-500" />
      </dl>
    </section>
  )
}

function Tick({ at, className }: { at: number; className: string }) {
  return <div className={`absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded ${className}`} style={{ left: `${at}%` }} />
}

function Stat({ label, value, swatch, highlight }: { label: string; value: string; swatch: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-2 py-3">
      <dt className="flex items-center justify-center gap-1.5 text-xs text-stone-500">
        <span className={`size-2 rounded-full ${swatch}`} />
        {label}
      </dt>
      <dd className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${highlight ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  )
}

// One bar chart per section. Section scores are discrete, so each bar is one possible score and its height is how
// many candidates got it. The candidate's own score is highlighted.
function SectionCharts({ result, overall }: { result: VptResult; overall: PoolStats }) {
  const { t } = useI18n()
  return (
    <section>
      <h3 className="text-lg font-semibold tracking-tight">{t('sec.title')}</h3>
      <p className="mt-0.5 text-xs text-stone-500">{t('sec.legend')}</p>
      <ul className="mt-4 grid gap-6">
        {result.categories.map((c) => {
          const dist = overall.categoryDist?.[c.key]
          const pct = overall.categoryPercentile?.[c.key]
          const median = dist ? medianScore(dist) : undefined
          const selection = median === undefined ? null : selectionFor(c.key, median)
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{t(`cat.${c.key}` as Key)}</span>
                <span className="shrink-0 tabular-nums text-stone-500">
                  <span className="font-semibold text-accent">{c.points}</span> <span className="text-stone-300">/ {c.max}</span>
                </span>
              </div>
              {dist ? (
                <ScoreBars dist={dist} mine={c.points} all={SECTION_SCORES[c.key]} />
              ) : (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(c.points / c.max) * 100}%` }} />
                </div>
              )}
              <p className="mt-1.5 text-xs font-medium text-stone-500">
                {pct !== undefined && <span className="font-semibold text-accent">{t('ins.pct', { p: topPercent(pct) })}</span>}
                {pct !== undefined && median !== undefined && ' · '}
                {median !== undefined && t('sec.median', { median })}
                {median !== undefined && selection && ` | ${t(selection.key as Key, selection.params)}`}
              </p>
            </li>
          )
        })}
      </ul>
      {overall.categoryPercentile && (
        <p className="mt-4 text-xs leading-relaxed text-stone-500">{t('ins.pctNote')}</p>
      )}
    </section>
  )
}

function ScoreBars({
  dist,
  mine,
  all,
}: {
  dist: { points: number; count: number }[]
  mine: number
  all: number[]
}) {
  const { t } = useI18n()
  const counts = new Map(dist.map((d) => [d.points, d.count]))
  // One bar for every score the section can give, plus any the server reports that are not in the list.
  const values = [...new Set([...all, ...counts.keys(), mine])].sort((a, b) => a - b)
  const peak = Math.max(1, ...counts.values())
  // Many bars leave no room for horizontal labels, so they are turned on their side.
  const dense = values.length > 8

  return (
    <div className="mt-2">
      <div className={`flex h-16 items-end ${dense ? 'gap-0.5' : 'gap-1'}`}>
        {values.map((v) => {
          const count = counts.get(v) ?? 0
          return (
            <div
              key={v}
              title={t('sec.bar', { count, points: v })}
              aria-label={t('sec.bar', { count, points: v })}
              className={`flex-1 rounded-t ${v === mine ? 'bg-accent' : 'bg-stone-300'}`}
              style={{ height: `${Math.max(count === 0 ? 4 : 8, (count / peak) * 100)}%` }}
            />
          )
        })}
      </div>
      <div className={`mt-1 flex text-[10px] text-stone-400 tabular-nums ${dense ? 'gap-0.5' : 'gap-1'}`}>
        {values.map((v) => (
          <span
            key={v}
            className={`flex-1 text-center ${dense ? '[writing-mode:vertical-rl] rotate-180' : ''} ${
              v === mine ? 'font-semibold text-accent' : ''
            }`}
          >
            {v}
          </span>
        ))}
      </div>
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
