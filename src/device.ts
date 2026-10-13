// A random id this browser keeps, so the server can limit how many results one device submits.
// It is not tied to a person, and the server stores only a hash of it. Clearing site data creates a new one.

const KEY = 'vpt-device'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Used when storage is blocked: the same id for the rest of this page visit.
let fallback: string | null = null

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID needs a secure context. This covers plain HTTP during local testing.
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && UUID.test(saved)) return saved
    const id = randomUuid()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    fallback ??= randomUuid()
    return fallback
  }
}
