import { useEffect, useState, type ReactNode } from 'react'

export const CARD = 'rounded-2xl bg-white p-4 shadow-sm sm:p-6'
export const TITLE = 'text-lg font-semibold tracking-tight'
export const BTN =
  'min-h-11 rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 active:bg-stone-100 disabled:opacity-40 sm:min-h-10'
export const SELECT =
  'min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:min-h-10 sm:text-sm'
export const INPUT =
  'min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:min-h-10 sm:text-sm'

export function Card(props: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className={TITLE}>{props.title}</h2>
      {props.note && <p className="mt-0.5 mb-4 text-xs text-stone-500">{props.note}</p>}
      {props.children}
    </section>
  )
}


// What to tell the admin when a call to the server did not return data.
export function problemText(status: string): string {
  if (status === 'forbidden') return 'This account does not have access.'
  if (status === 'unconfigured') return 'The ADMIN_EMAIL secret is not set on the server.'
  if (status === 'implausible') return 'Those answers do not look possible, such as more experience than the age allows or income above $500,000.'
  if (status === 'not_found') return 'That submission no longer exists.'
  if (status === 'bad_request') return 'The server rejected that request. Check the values and try again.'
  return 'Could not load the data. Try again shortly.'
}

export function Problem({ status }: { status: string }) {
  return (
    <div className={CARD}>
      <p role="alert">{problemText(status)}</p>
    </div>
  )
}

const COMPACT = '(max-width: 639px)'

// True on a phone-sized screen. Pages use it to swap wide tables for stacked cards. Without matchMedia (old
// browsers, tests) it reports a desktop screen.
export function useCompact(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [compact, setCompact] = useState(() => supported && window.matchMedia(COMPACT).matches)
  useEffect(() => {
    if (!supported) return
    const query = window.matchMedia(COMPACT)
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [supported])
  return compact
}
