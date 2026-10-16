// Turns the filter form and the sort list into what the admin function expects.

export interface FilterForm {
  ageMin: string
  ageMax: string
  scoreMin: string
  scoreMax: string
  incomeMin: string
  incomeMax: string
  occupation: string
  english: string[]
  education: string[]
  experience: string[]
  location: string[]
  partner: 'any' | 'yes' | 'no'
}

export const emptyFilters: FilterForm = {
  ageMin: '', ageMax: '', scoreMin: '', scoreMax: '', incomeMin: '', incomeMax: '',
  occupation: '', english: [], education: [], experience: [], location: [], partner: 'any',
}

const number = (text: string): number | null => {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

// Blank boxes and empty selections mean no filter. Whole-number columns get whole-number bounds, rounded inward
// so 25.5 as a minimum age keeps ages from 26.
export function buildFilters(form: FilterForm): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const set = (key: string, value: number | null) => {
    if (value !== null) out[key] = value
  }
  const ageMin = number(form.ageMin)
  const ageMax = number(form.ageMax)
  const scoreMin = number(form.scoreMin)
  const scoreMax = number(form.scoreMax)
  set('ageMin', ageMin === null ? null : Math.ceil(ageMin))
  set('ageMax', ageMax === null ? null : Math.floor(ageMax))
  set('scoreMin', scoreMin === null ? null : Math.ceil(scoreMin))
  set('scoreMax', scoreMax === null ? null : Math.floor(scoreMax))
  set('incomeMin', number(form.incomeMin))
  set('incomeMax', number(form.incomeMax))
  const occupation = form.occupation.trim()
  if (occupation) out.occupation = occupation
  for (const key of ['english', 'education', 'experience', 'location'] as const) {
    if (form[key].length > 0) out[key] = form[key]
  }
  if (form.partner !== 'any') out.partner = form.partner
  return out
}

export type SortField = 'total' | 'age' | 'income'
export interface SortRule {
  f: SortField
  d: 'asc' | 'desc'
}

export const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'total', label: 'Total score' },
  { value: 'age', label: 'Age' },
  { value: 'income', label: 'Income' },
]

export const MAX_RULES = SORT_FIELDS.length

// The first field not used yet, or null when every field has a rule.
export function nextField(rules: SortRule[]): SortField | null {
  return SORT_FIELDS.find((f) => !rules.some((r) => r.f === f.value))?.value ?? null
}

export function addRule(rules: SortRule[]): SortRule[] {
  const f = nextField(rules)
  return f ? [...rules, { f, d: 'desc' }] : rules
}

export function removeRule(rules: SortRule[], index: number): SortRule[] {
  return rules.filter((_, i) => i !== index)
}

export function toggleRule(rules: SortRule[], index: number): SortRule[] {
  return rules.map((r, i) => (i === index ? { ...r, d: r.d === 'asc' ? 'desc' : 'asc' } : r))
}

// A field can sit in only one rule, so choosing one that is used elsewhere swaps the two.
export function setRuleField(rules: SortRule[], index: number, f: SortField): SortRule[] {
  const other = rules.findIndex((r, i) => i !== index && r.f === f)
  return rules.map((r, i) => {
    if (i === index) return { ...r, f }
    if (i === other) return { ...r, f: rules[index].f }
    return r
  })
}

// Moves a rule earlier (-1) or later (+1). Earlier rules decide the order first.
export function moveRule(rules: SortRule[], index: number, delta: -1 | 1): SortRule[] {
  const to = index + delta
  if (to < 0 || to >= rules.length) return rules
  const next = [...rules]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export function describeSort(rules: SortRule[]): string {
  if (rules.length === 0) return 'Newest first'
  return rules
    .map((r) => `${SORT_FIELDS.find((f) => f.value === r.f)?.label ?? r.f} ${r.d === 'asc' ? 'low to high' : 'high to low'}`)
    .join(', then ')
}
