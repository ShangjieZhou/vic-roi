// The device-side history of submitted results. The server keeps each result under its id, so only a small
// reference is stored here: enough to list it and reopen it. Nothing here identifies a person.

const HISTORY_KEY = 'vpt-history'
// Earlier versions stored only the latest result under this key. It is migrated into the list on first read.
const LEGACY_KEY = 'vpt-submission'
const MAX_ENTRIES = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface HistoryEntry {
  id: string
  total: number
  location: 'onshore' | 'offshore'
  // The English title or typed text, and the ANZSCO code when the occupation was picked from the list.
  occupation: string | null
  occupationCode: string | null
  savedAt: number
}

function toEntry(value: unknown): HistoryEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const e = value as Partial<HistoryEntry>
  if (
    typeof e.id === 'string' && UUID.test(e.id) &&
    typeof e.total === 'number' && Number.isFinite(e.total) &&
    (e.location === 'onshore' || e.location === 'offshore') &&
    typeof e.savedAt === 'number' && Number.isFinite(e.savedAt) &&
    (e.occupation === undefined || e.occupation === null || typeof e.occupation === 'string') &&
    (e.occupationCode === undefined || e.occupationCode === null || /^\d{6}$/.test(String(e.occupationCode)))
  ) {
    return {
      id: e.id,
      total: e.total,
      location: e.location,
      occupation: e.occupation ?? null,
      occupationCode: e.occupationCode ?? null,
      savedAt: e.savedAt,
    }
  }
  return null
}

function persist(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    // Storage can be blocked or full. Every result link still works, so losing the list is acceptable.
  }
}

function read(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(toEntry).filter((e): e is HistoryEntry => e !== null) : []
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy !== null) {
      const entry = toEntry(JSON.parse(legacy))
      const list = entry ? [entry] : []
      persist(list)
      localStorage.removeItem(LEGACY_KEY)
      return list
    }
  } catch {
    // Corrupt or unreadable value: treat as an empty history.
  }
  return []
}

// Newest first.
export function loadHistory(): HistoryEntry[] {
  return read().sort((a, b) => b.savedAt - a.savedAt)
}

export function addToHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...read().filter((e) => e.id !== entry.id)]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_ENTRIES)
  persist(list)
  return list
}

export function removeFromHistory(id: string): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.id !== id)
  persist(list)
  return list
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Nothing to do.
  }
}

export function timeAgo(savedAt: number, lang: 'en' | 'zh', now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' })
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000))
  if (seconds < 60) return rtf.format(0, 'second')
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute')
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), 'hour')
  return rtf.format(-Math.round(seconds / 86_400), 'day')
}
