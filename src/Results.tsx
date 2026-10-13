import { useEffect, useRef, useState, type RefObject } from 'react'
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
import { COFFEE_URL, feedbackUrl, turnstileSiteKey } from './config'
import { money } from './format'
import { ChevronIcon, CoffeeIcon, LockIcon } from './icons'
import { trackSupport } from './events'
import { useI18n, type Key } from './i18n'
import { Modal } from './Modal'
import { OccupationPicker } from './OccupationPicker'
import { occupationDisplayName } from './occupationSearch'
import { PartnerRequirements } from './PartnerRequirements'
import { loadMinimized, saveMinimized } from './support'
import { SECTION_SCORES, medianScore, topPercent, typicalFor } from './sectionScores'
import { Distribution } from './Distribution'
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
        <div className="mt-10">
          <ScoreBreakdown low={low} high={high} earningsNote={earningsNote} />
        </div>
      )}

      {props.submission && resolved ? (
        <InsightsPanel
          input={resolved}
          earningsNote={earningsNote}
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

// The score in each section as a filled bar. A range shows the lowest score solid and the highest lighter.
function ScoreBreakdown({ low, high, earningsNote }: { low: VptResult; high: VptResult; earningsNote: string }) {
  const { t } = useI18n()
  return (
    <ul className="grid gap-5">
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
  earningsNote: string
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
          <section>
            <h3 className="mb-4 text-lg font-semibold tracking-tight">{t('res.breakdown')}</h3>
            <ScoreBreakdown low={props.result} high={props.result} earningsNote={props.earningsNote} />
          </section>
          <SectionCharts result={props.result} insights={insights} />
          <SupportCard />
        </>
      ) : (
        <WaitingCard insights={insights} onRefresh={props.onRefresh} />
      )}

      {isRanked(overall) && <OccupationBreakdown insights={insights} result={props.result} />}

      <p className="text-xs leading-relaxed text-stone-400">{t('ins.disclaimer')}</p>

      <ShareLink />
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

// A question mark that explains how the occupation group was chosen, and which group this candidate is in.
function GroupingHelp({ insights }: { insights: Insights }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const occ = insights.occupation
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('group.help')}
        title={t('group.help')}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-stone-400 text-[11px] font-semibold text-stone-500 active:bg-stone-100"
      >
        ?
      </button>
      {open && (
        <Modal
          title={t('group.title')}
          onClose={() => {
            setOpen(false)
            trigger.current?.focus()
          }}
        >
          <div className="mt-2 grid gap-2.5 text-sm leading-relaxed text-stone-700">
            <p>{t('group.p1')}</p>
            <p>{t('group.p2')}</p>
            <p>{t('group.p3')}</p>
            <p>{t('group.p4')}</p>
            {occ?.prefix && occ.level && occ.level < 6 && (
              <p className="rounded-xl bg-stone-100 p-3 font-medium text-stone-800">
                {t('group.yours', { prefix: occ.prefix, level: t(`group.level.${occ.level}` as Key), n: occ.n })}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

// The name of the occupation group the comparison used: the occupation itself, or a wider group of similar ones.
function occupationGroupLabel(insights: Insights, t: ReturnType<typeof useI18n>['t'], lang: 'en' | 'zh'): string {
  const occ = insights.occupation
  if (!occ) return ''
  const name = occ.code ? occupationDisplayName(occ.code, lang) : occ.name
  return occ.level && occ.level < 6 && occ.prefix ? t('cmp.similar', { name, prefix: occ.prefix }) : name
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
        return occupationGroupLabel(insights, t, lang)
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{t('cmp.title')}</h3>
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.kind} className="rounded-xl bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label(row)}</span>
                <span className="block text-xs text-stone-500">{t('cmp.n', { n: row.n })}</span>
                {row.kind === 'occupation' && row.level != null && row.level < 6 && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                    {t('cmp.notExact')}
                    <GroupingHelp insights={insights} />
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {row.percentile !== undefined ? (
                  <span className="text-lg font-semibold tracking-tight text-accent">{t('ins.pct', { p: topPercent(row.percentile) })}</span>
                ) : (
                  <span className="text-xs text-stone-500">{t('cmp.first')}</span>
                )}
              </span>
            </div>
            {row.hist && row.percentile !== undefined && (
              <Distribution hist={row.hist} mine={insights.total} median={row.median} n={row.n} />
            )}
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
// many candidates got it. The candidate's own score is highlighted. A switch compares against everyone or against
// candidates in a similar occupation.
function SectionCharts({ result, insights }: { result: VptResult; insights: Insights }) {
  const { t, lang } = useI18n()
  const [pool, setPool] = useState<'all' | 'similar'>('all')
  const { overall, occupation } = insights
  const canSwitch = !!occupation && isRanked(occupation) && !!occupation.categoryDist
  const stats: PoolStats = pool === 'similar' && canSwitch ? occupation : overall
  // Who the median describes, for the sentence under each chart.
  const who: Key =
    pool === 'similar' && canSwitch
      ? occupation.level != null && occupation.level < 6 ? 'typ.who.similar' : 'typ.who.same'
      : 'typ.who.all'
  const segment = (active: boolean) =>
    `min-h-10 flex-1 rounded-lg px-3 text-sm font-medium transition ${
      active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 active:text-stone-900'
    }`

  return (
    <section>
      <h3 className="text-lg font-semibold tracking-tight">{t('sec.title')}</h3>
      <p className="mt-0.5 text-xs text-stone-500">{t('sec.legend')}</p>
      {canSwitch && (
        <div role="group" aria-label={t('sec.pool.label')} className="mt-3 flex gap-1 rounded-xl bg-stone-200/70 p-1">
          <button type="button" aria-pressed={pool === 'all'} className={segment(pool === 'all')} onClick={() => setPool('all')}>
            {t('sec.pool.all')}
          </button>
          <button type="button" aria-pressed={pool === 'similar'} className={segment(pool === 'similar')} onClick={() => setPool('similar')}>
            {t('sec.pool.similar')}
          </button>
        </div>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-stone-500">
        {pool === 'similar' && canSwitch && <span>{occupationGroupLabel(insights, t, lang)}.</span>}
        <span>{t('sec.pool.n', { n: stats.n })}</span>
        {pool === 'similar' && canSwitch && occupation.level != null && occupation.level < 6 && (
          <GroupingHelp insights={insights} />
        )}
      </p>
      {pool === 'similar' && canSwitch && stats.n < 5 && (
        <p className="mt-0.5 text-xs text-stone-500">{t('sec.pool.few')}</p>
      )}
      <ul className="mt-4 grid gap-6">
        {result.categories.map((c) => {
          const dist = stats.categoryDist?.[c.key]
          const pct = stats.categoryPercentile?.[c.key]
          const median = dist ? medianScore(dist) : undefined
          const typical = median === undefined ? null : typicalFor(c.key, median)
          return (
            <li key={`${pool}-${c.key}`}>
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
              </p>
              {typical && (
                <p className="mt-0.5 text-xs text-stone-600">
                  {t('typ.line', { who: t(who), what: t(typical.key as Key, typical.params) })}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {stats.categoryPercentile && (
        <p className="mt-4 text-xs leading-relaxed text-stone-500">{t('ins.pctNote')}</p>
      )}
    </section>
  )
}

// Height in pixels of the tallest section bar.
const BAR_AREA = 64

// One bar per possible score, with its count on top. The candidate's own bar is highlighted, and tapping any bar
// shows how many candidates scored that value.
function ScoreBars({ dist, mine, all }: { dist: { points: number; count: number }[]; mine: number; all: number[] }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<number | null>(null)
  const counts = new Map(dist.map((d) => [d.points, d.count]))
  // One bar for every score the section can give, plus any the server reports that are not in the list.
  const values = [...new Set([...all, ...counts.keys(), mine])].sort((a, b) => a - b)
  const peak = Math.max(1, ...counts.values())
  // Many bars leave no room for horizontal text, so labels and counts are turned on their side.
  const dense = values.length > 8
  const gap = dense ? 'gap-0.5' : 'gap-1'
  const sideways = dense ? '[writing-mode:vertical-rl] rotate-180' : ''
  // The tallest bar is BAR_AREA pixels. Each count sits in the column just above its own bar.
  const barPx = (count: number) => Math.round((Math.max(count === 0 ? 4 : 8, (count / peak) * 100) / 100) * BAR_AREA)

  return (
    <div className="mt-2">
      <div className={`flex items-end ${gap} ${dense ? 'h-[calc(4rem+2.25rem)]' : 'h-[calc(4rem+1.5rem)]'}`}>
        {values.map((v) => {
          const count = counts.get(v) ?? 0
          const text = t('sec.bar', { count, points: v })
          return (
            <div key={v} className="flex flex-1 flex-col items-center justify-end">
              <span
                data-count
                className={`mb-0.5 text-[10px] leading-none tabular-nums ${sideways} ${
                  v === mine ? 'font-semibold text-accent' : count === 0 ? 'text-stone-300' : 'text-stone-500'
                }`}
              >
                {count}
              </span>
              <button
                type="button"
                title={text}
                aria-label={text}
                aria-pressed={picked === v}
                onClick={() => setPicked(picked === v ? null : v)}
                className={`w-full rounded-t ${v === mine ? 'bg-accent' : 'bg-stone-300'} ${picked === v ? 'ring-2 ring-stone-900/70' : ''}`}
                style={{ height: `${barPx(count)}px` }}
              />
            </div>
          )
        })}
      </div>
      <div className={`mt-1 flex text-[10px] text-stone-400 tabular-nums ${gap}`}>
        {values.map((v) => (
          <span
            key={v}
            className={`flex-1 text-center ${sideways} ${v === mine ? 'font-semibold text-accent' : ''}`}
          >
            {v}
          </span>
        ))}
      </div>
      {picked !== null && (
        <p className="mt-1 text-xs font-medium text-stone-700" aria-live="polite">
          {t('sec.bar', { count: counts.get(picked) ?? 0, points: picked })}
          {picked === mine && ` · ${t('sec.you')}`}
        </p>
      )}
    </div>
  )
}

// The listed occupations with the most candidates. Each row opens to show how that occupation scores: the median
// total, then the median and the typical person in each of the seven sections.
function OccupationBreakdown({ insights, result }: { insights: Insights; result: VptResult }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const list = insights.topOccupations ?? []
  if (list.length === 0) return null
  const everyone = insights.overall.n
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(code)) next.add(code)
      return next
    })
  return (
    <section>
      <h3 className="text-lg font-semibold tracking-tight">{t('occ.title')}</h3>
      <p className="mt-0.5 text-xs text-stone-500">{t('occ.sub')}</p>
      <ol className="mt-4 grid gap-2">
        {list.map((o, i) => {
          const mine = o.code === insights.occupation?.code
          const isOpen = open.has(o.code)
          const panel = `occ-${o.code}`
          return (
            <li key={o.code} className={`rounded-xl border bg-white ${mine ? 'border-accent/50' : 'border-stone-200'}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(o.code)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left active:bg-stone-50"
              >
                <span className="min-w-0 text-sm font-medium">
                  <span className="mr-1.5 tabular-nums text-stone-400">{i + 1}</span>
                  {occupationDisplayName(o.code, lang)}
                  {mine && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-[10px] font-semibold text-white">
                      {t('occ.you')}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* The line breaks after the comma, so the count and the share each sit on their own line. */}
                  <span className="whitespace-pre-line text-right text-xs leading-snug text-stone-500">
                    {t('occ.share', { n: o.n, share: Math.round((100 * o.n) / Math.max(1, everyone)) }).replace(/([,，])\s*/, '$1\n')}
                  </span>
                  <ChevronIcon open={isOpen} />
                </span>
              </button>
              {isOpen && (
                <div id={panel} className="border-t border-stone-100 px-4 py-3">
                  <p className="text-sm font-semibold">{t('occ.medianTotal', { median: o.median })}</p>
                  <ul className="mt-3 grid gap-3">
                    {result.categories.map((c) => {
                      const median = o.categoryMedian?.[c.key]
                      if (median === undefined) return null
                      const typical = typicalFor(c.key, median)
                      return (
                        <li key={c.key}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium">{t(`cat.${c.key}` as Key)}</span>
                            <span className="shrink-0 tabular-nums text-stone-500">{t('sec.median', { median })}</span>
                          </div>
                          {typical && (
                            <p className="mt-0.5 text-xs text-stone-600">
                              {t('typ.line', { who: t('typ.who.this'), what: t(typical.key as Key, typical.params) })}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Calls back once, the first time at least half of the element is on screen.
function useSeen(ref: RefObject<Element | null>, onSeen: () => void) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      onSeen()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onSeen()
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // The callback only sends a count, so the first render's version is enough.
  }, [])
}

// An optional tip and a feedback link, shown once the visitor has their analysis. Nothing is unlocked by paying.
// It can be minimized, and stays minimized on later visits. Views, minimizes and clicks are counted anonymously.
function SupportCard() {
  const { t } = useI18n()
  const feedback = feedbackUrl()
  const [minimized, setMinimized] = useState(loadMinimized)
  const ref = useRef<HTMLElement>(null)
  useSeen(ref, () => trackSupport('coffee_seen'))
  const button =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition active:scale-[0.98]'
  const change = (next: boolean) => {
    setMinimized(next)
    saveMinimized(next)
  }

  if (minimized) {
    return (
      <section ref={ref} className="rounded-2xl border border-[#f28b50]/25 bg-[#fef8f5] px-5">
        <button
          type="button"
          aria-expanded={false}
          onClick={() => change(false)}
          className="flex min-h-14 w-full items-center justify-between gap-3 text-left"
        >
          <span className="font-semibold text-[#d9672b]">{t('support.title')}</span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-stone-600">
            {t('support.expand')}
            <ChevronIcon open={false} />
          </span>
        </button>
      </section>
    )
  }

  return (
    <section ref={ref} className="rounded-2xl border border-[#f28b50]/25 bg-[#fef8f5] p-6 text-stone-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-tight text-[#d9672b]">{t('support.title')}</h3>
        <button
          type="button"
          aria-expanded
          onClick={() => {
            trackSupport('coffee_minimized')
            change(true)
          }}
          className="-mt-2 -mr-3 flex min-h-11 shrink-0 items-center gap-1 px-3 text-xs font-medium text-stone-500 active:text-stone-900"
        >
          {t('support.minimize')}
          <ChevronIcon open />
        </button>
      </div>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-700">{t('support.body')}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-700">{t('support.feedbackNote')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSupport('coffee_clicked')}
          className={`${button} bg-[#f28b50] text-stone-900 shadow-sm hover:bg-[#ee7d3d]`}
        >
          <CoffeeIcon className="size-5" />
          {t('support.coffee')}
        </a>
        {feedback && (
          <a
            href={feedback}
            target="_blank"
            rel="noopener noreferrer"
            className={`${button} border-2 border-[#f28b50] text-[#b9531f] hover:bg-[#f28b50]/10`}
          >
            {t('support.feedback')}
          </a>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-stone-500">{t('support.note')}</p>
    </section>
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
