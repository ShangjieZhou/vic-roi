// Whether the visitor minimized the "Buy me a coffee" card. It stays minimized on later visits.
const KEY = 'vpt-support-minimized'

export function loadMinimized(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveMinimized(minimized: boolean): void {
  try {
    if (minimized) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage can be blocked. The card then starts open next time.
  }
}
