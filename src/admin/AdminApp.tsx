import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { clearSession, loadSession, parseHash, requestLink, saveSession, type Session } from './auth'
import { DIMENSIONS, OCCUPATION_GROUPS, SECTION_LABELS, labelFor, melbourne, orderRows, percent } from './labels'
import { loadStats, type AdminStats } from './types'

const CARD = 'rounded-2xl bg-white p-4 shadow-sm sm:p-6'
const TITLE = 'text-lg font-semibold tracking-tight'

type View =
  | { kind: 'signin'; notice?: string }
  | { kind: 'loading' }
  | { kind: 'blocked'; message: string }
  | { kind: 'data'; stats: AdminStats }

// Search engines are told to skip this page. The address itself is also not linked from anywhere.
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    document.title = 'VPT admin'
    return () => meta.remove()
  }, [])
}

export function AdminApp() {
  useNoIndex()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [session, setSession] = useState<Session | null>(null)

  const load = useCallback(async (s: Session) => {
    setView({ kind: 'loading' })
    const out = await loadStats(s.token)
    if (out.status === 'ok') return setView({ kind: 'data', stats: out.stats })
    if (out.status === 'signed_out') {
      clearSession()
      setSession(null)
      return setView({ kind: 'signin', notice: 'Your sign-in expired. Request a new link.' })
    }
    if (out.status === 'forbidden') return setView({ kind: 'blocked', message: 'This account does not have access.' })
    if (out.status === 'unconfigured') return setView({ kind: 'blocked', message: 'The ADMIN_EMAIL secret is not set on the server.' })
    setView({ kind: 'blocked', message: 'Could not load the data. Try again shortly.' })
  }, [])

  useEffect(() => {
    const fromLink = parseHash(window.location.hash)
    if (fromLink.session || fromLink.error) window.history.replaceState(null, '', window.location.pathname)
    if (fromLink.session) saveSession(fromLink.session)
    const current = fromLink.session ?? loadSession()
    if (current) {
      setSession(current)
      void load(current)
    } else {
      setView({ kind: 'signin', notice: fromLink.error ? 'That link is invalid or has expired. Request a new one.' : undefined })
    }
  }, [load])

  const signOut = () => {
    clearSession()
    setSession(null)
    setView({ kind: 'signin' })
  }

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight">VPT admin</h1>
            {view.kind === 'data' && <p className="text-xs text-stone-500">Updated {melbourne(view.stats.generatedAt)} (Melbourne)</p>}
          </div>
          {session && (
            <div className="flex gap-2">
              <button className={BTN} onClick={() => void load(session)}>
                Refresh
              </button>
              <button className={BTN} onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {view.kind === 'loading' && <p className="text-sm text-stone-500">Loading...</p>}
        {view.kind === 'signin' && <SignIn notice={view.notice} />}
        {view.kind === 'blocked' && (
          <div className={CARD}>
            <p role="alert">{view.message}</p>
          </div>
        )}
        {view.kind === 'data' && <Dashboard stats={view.stats} />}
      </main>
    </div>
  )
}

const BTN =
  'min-h-10 rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 active:bg-stone-100'

function SignIn({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const submit = async () => {
    if (!email.trim() || state === 'busy') return
    setState('busy')
    setState(await requestLink(email))
  }
  return (
    <form
      className={`${CARD} mx-auto max-w-md`}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className={TITLE}>Sign in</h2>
      <p className="mt-1 text-sm text-stone-600">Enter your email and Supabase sends you a one-time sign-in link.</p>
      {notice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      <label htmlFor="admin-email" className="sr-only">
        Email
      </label>
      <input
        id="admin-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-4 w-full rounded-xl border border-stone-300 px-3 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        disabled={!email.trim() || state === 'busy'}
        className="mt-3 min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {state === 'busy' ? 'Sending...' : 'Email me a link'}
      </button>
      {state === 'sent' && (
        <p role="status" className="mt-3 text-sm text-stone-600">
          If that address has access, a link is on its way. Open it in this browser.
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Could not send a link right now. Try again in a few minutes.
        </p>
      )}
    </form>
  )
}

function Dashboard({ stats }: { stats: AdminStats }) {
  const { totals, score } = stats
  const seen = stats.support.find((e) => e.event === 'coffee_seen')
  const clicked = stats.support.find((e) => e.event === 'coffee_clicked')
  const minimized = stats.support.find((e) => e.event === 'coffee_minimized')
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submissions" value={totals.n.toLocaleString()} />
        <Stat label="Last 24 hours" value={totals.last24h.toLocaleString()} />
        <Stat label="Last 7 days" value={totals.last7d.toLocaleString()} />
        <Stat label="Median score" value={String(score.median)} />
        <Stat label="Mean score" value={`${score.mean} (sd ${score.sd})`} />
        <Stat label="With a listed occupation" value={percent(totals.withCode, totals.n)} />
      </div>

      <Card title="Submissions per day" note="Last 30 days, Melbourne time">
        <DailyChart days={stats.daily} />
      </Card>

      <Card title="Score distribution" note="Candidates per 10-point band">
        <Histogram hist={stats.hist} />
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-7">
          {(
            [
              ['Lowest', score.min],
              ['10th percentile', score.p10],
              ['25th percentile', score.p25],
              ['Median', score.median],
              ['75th percentile', score.p75],
              ['90th percentile', score.p90],
              ['Highest', score.max],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-stone-50 px-2 py-2">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        {DIMENSIONS.map((d) => {
          const rows = orderRows(d.key, stats.cuts[d.key] ?? [])
          const biggest = Math.max(1, ...rows.map((r) => r.n))
          return (
            <Card key={d.key} title={d.title} note="Candidates in each group and its median score. Bars are relative to the largest group.">
              <div className="grid gap-2">
                {rows.map((r) => (
                  <BarRow
                    key={r.k}
                    label={labelFor(d.key, r.k)}
                    fraction={r.n / biggest}
                    left={`${r.n.toLocaleString()} (${percent(r.n, totals.n)})`}
                    right={`median ${r.median}`}
                  />
                ))}
              </div>
            </Card>
          )
        })}
      </section>

      <Card title="Points in each section" note="Average, median and how many reach the maximum. Bars show how many candidates earned each points value.">
        <div className="grid gap-5 lg:grid-cols-2">
          {Object.entries(stats.sections).map(([key, s]) => {
            const biggest = Math.max(1, ...s.dist.map((p) => p.n))
            return (
              <div key={key} className="rounded-xl bg-stone-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{SECTION_LABELS[key] ?? key}</h3>
                  <span className="text-xs text-stone-500">
                    average {s.avg} of {s.max}, median {s.median}, {percent(s.atMax, s.n)} at the maximum
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {s.dist.map((p) => (
                    <BarRow key={p.points} label={`${p.points} points`} fraction={p.n / biggest} left={`${p.n.toLocaleString()} (${percent(p.n, s.n)})`} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="What the top quarter has that the rest lacks" note="Average points per section for candidates at or above the 75th percentile, against everyone else. Sorted by the gap.">
        <div className="grid gap-3">
          {stats.gap.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{SECTION_LABELS[g.key] ?? g.key}</span>
                <span className="text-xs text-stone-500 tabular-nums">
                  top {g.top}, rest {g.rest}, gap {(g.top - g.rest).toFixed(1)} (of {g.max})
                </span>
              </div>
              <TwoBars top={g.top / g.max} rest={g.rest / g.max} />
            </div>
          ))}
          <p className="text-xs text-stone-500">Dark bar: top quarter. Light bar: everyone else.</p>
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card title="Occupation groups" note="First digit of the ANZSCO code">
          <div className="grid gap-2">
            {stats.occupationGroups.map((g) => (
              <BarRow
                key={g.group}
                label={OCCUPATION_GROUPS[g.group] ?? `Group ${g.group}`}
                fraction={g.n / Math.max(1, stats.occupationGroups[0]?.n ?? 1)}
                left={`${g.n.toLocaleString()} (${percent(g.n, totals.withCode)})`}
                right={`median ${g.median}`}
              />
            ))}
          </div>
        </Card>
        <Card title="Top 30 occupations" note="Candidates and median score">
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">Occupation</th>
                  <th className="px-2 py-1 text-right font-medium">Candidates</th>
                  <th className="py-1 pl-2 text-right font-medium">Median</th>
                </tr>
              </thead>
              <tbody>
                {stats.occupations.map((o) => (
                  <tr key={o.code} className="border-t border-stone-100">
                    <td className="py-1.5 pr-2">
                      {o.name} <span className="text-xs text-stone-400">{o.code}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{o.n.toLocaleString()}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{o.median}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <Card title="Support card" note="Counted once per device">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Saw the card" value={(seen?.devices ?? 0).toLocaleString()} />
          <Stat label="Clicked the coffee button" value={`${(clicked?.devices ?? 0).toLocaleString()} (${percent(clicked?.devices ?? 0, seen?.devices ?? 0)})`} />
          <Stat label="Minimized it" value={`${(minimized?.devices ?? 0).toLocaleString()} (${percent(minimized?.devices ?? 0, seen?.devices ?? 0)})`} />
          <Stat label="Feedback messages" value={stats.feedback.count.toLocaleString()} />
        </dl>
      </Card>

      <Card title="Feedback" note={`Newest first, up to 100 of ${stats.feedback.count}`}>
        {stats.feedback.items.length === 0 ? (
          <p className="text-sm text-stone-500">No messages yet.</p>
        ) : (
          <ul className="grid gap-3">
            {stats.feedback.items.map((f, i) => (
              <li key={i} className="rounded-xl bg-stone-50 p-3">
                <p className="text-xs text-stone-500">
                  {melbourne(f.at)} · {f.lang === 'zh' ? 'Chinese' : 'English'}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Card(props: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className={TITLE}>{props.title}</h2>
      {props.note && <p className="mt-0.5 mb-4 text-xs text-stone-500">{props.note}</p>}
      {props.children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function BarRow(props: { label: string; fraction: number; left: string; right?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{props.label}</span>
        <span className="shrink-0 text-xs text-stone-500 tabular-nums">
          {props.left}
          {props.right && <> · {props.right}</>}
        </span>
      </div>
      <div className="mt-0.5 h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(1, Math.round(props.fraction * 100))}%` }} />
      </div>
    </div>
  )
}

function TwoBars({ top, rest }: { top: number; rest: number }) {
  return (
    <div className="mt-1 grid gap-1">
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.round(top * 100)}%` }} />
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-indigo-300" style={{ width: `${Math.round(rest * 100)}%` }} />
      </div>
    </div>
  )
}

function DailyChart({ days }: { days: { day: string; n: number }[] }) {
  const biggest = Math.max(1, ...days.map((d) => d.n))
  return (
    <div>
      <div className="flex h-36 items-end gap-0.5">
        {days.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(2, (d.n / biggest) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{days[0]?.day}</span>
        <span>most in a day: {biggest.toLocaleString()}</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  )
}

function Histogram({ hist }: { hist: number[] }) {
  const first = Math.max(0, hist.findIndex((n) => n > 0) - 1)
  const last = Math.min(hist.length - 1, hist.length - 1 - [...hist].reverse().findIndex((n) => n > 0) + 1)
  const bands = hist.slice(first, last + 1)
  const biggest = Math.max(1, ...bands)
  return (
    <div>
      <div className="flex h-40 items-end gap-0.5">
        {bands.map((n, i) => (
          <div key={i} title={`${(first + i) * 10} to ${(first + i) * 10 + 9}: ${n}`} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(1, (n / biggest) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{first * 10}</span>
        <span>{(last + 1) * 10}</span>
      </div>
    </div>
  )
}
