// Victorian Points Test (VPT) 2026-27 scoring rules.
// Shared by the browser (instant results) and the edge function (server-side recompute before saving).
// Keep this file dependency-free so both Vite and Deno can import it.

export type Location = 'onshore' | 'offshore'
export type EnglishLevel = 'competent' | 'proficient' | 'superior'
export type EducationLevel = 'other' | 'bachelors' | 'masters' | 'phd'
export type SkillLevel = 1 | 2 | 3

export interface VptInput {
  location: Location
  age: number
  english: EnglishLevel
  experienceYears: number
  education: EducationLevel
  skillLevel: SkillLevel
  partnerQualifies: boolean
  annualEarnings: number
}

// What the wizard collects. Skill level and partner skills can be skipped, which turns the
// score into a range. Only a fully resolved draft can be submitted to the pool.
export interface VptDraft extends Omit<VptInput, 'skillLevel' | 'partnerQualifies'> {
  skillLevel: SkillLevel | 'unsure'
  partnerQualifies: boolean | 'unsure'
}

export type CategoryKey =
  | 'age'
  | 'english'
  | 'experience'
  | 'education'
  | 'skillLevel'
  | 'partner'
  | 'earnings'

export interface CategoryScore {
  key: CategoryKey
  label: string
  points: number
  max: number
}

export interface VptResult {
  total: number
  max: number
  categories: CategoryScore[]
}

const AGE_POINTS: Record<number, number> = {
  18: 265, 19: 282,
  30: 286, 31: 270, 32: 256, 33: 240, 34: 226, 35: 210,
  36: 196, 37: 180, 38: 166, 39: 150, 40: 136,
  41: 106, 42: 76, 43: 46, 44: 16,
}

export function agePoints(age: number): number {
  if (age >= 20 && age <= 29) return 300
  return AGE_POINTS[age] ?? 0
}

const ENGLISH_POINTS: Record<EnglishLevel, number> = {
  competent: 0,
  proficient: 100,
  superior: 200,
}

// experienceYears holds a band code chosen in the wizard, not literal years:
// 0 for 0 years -> 0, 1 for 1 year -> 20, 2 for 2 to 3 years -> 40, 4 for 4 to 5 -> 60, 6 for 6 to 7 -> 80, 9 for more than 8 -> 100.
// Codes in between fall into the band below them, so older literal-year submissions score as before. The points
// never changed when the labels were reworded, so saved submissions keep their score.
export function experiencePoints(years: number): number {
  if (years >= 9) return 100
  if (years >= 6) return 80
  if (years >= 4) return 60
  if (years >= 2) return 40
  if (years >= 1) return 20
  return 0
}

const EDUCATION_POINTS: Record<EducationLevel, number> = {
  other: 25,
  bachelors: 50,
  masters: 75,
  phd: 100,
}

export function skillLevelPoints(level: SkillLevel): number {
  return level === 1 ? 50 : 0
}

export function partnerPoints(qualifies: boolean): number {
  return qualifies ? 50 : 0
}

// The largest income the form accepts. The score itself caps out at 170,000, so a higher claim earns no extra
// points. Anything above this limit is treated as a typo or a false claim.
export const EARNINGS_INPUT_MAX = 300_000
export const EARNINGS_MIN = 80_000
export const EARNINGS_CAP = 170_000

// One entry per $5,000 band from $80,000. The published steps are 8 or 7 points, so the values
// are copied from the table instead of computed.
const EARNINGS_BAND_POINTS = [
  8, 16, 24, 32, 39, 47, 55, 63, 71, 79,
  87, 95, 103, 111, 118, 126, 134, 142, 150,
]

export function earningsPoints(earnings: number): number {
  if (!Number.isFinite(earnings) || earnings < EARNINGS_MIN) return 0
  if (earnings >= EARNINGS_CAP) return 150
  const band = Math.floor((earnings - EARNINGS_MIN) / 5_000)
  return EARNINGS_BAND_POINTS[band]
}

// Every candidate is scored out of 950. Victorian earnings only count for someone working in Victoria, so an
// offshore candidate gets 0 points for that section rather than the section being left out.
export function calculateVpt(input: VptInput): VptResult {
  const categories: CategoryScore[] = [
    { key: 'age', label: 'Age', points: agePoints(input.age), max: 300 },
    { key: 'english', label: 'English language', points: ENGLISH_POINTS[input.english], max: 200 },
    { key: 'experience', label: 'Experience in nominated occupation', points: experiencePoints(input.experienceYears), max: 100 },
    { key: 'education', label: 'Education', points: EDUCATION_POINTS[input.education], max: 100 },
    { key: 'skillLevel', label: 'Occupation skill level', points: skillLevelPoints(input.skillLevel), max: 50 },
    { key: 'partner', label: "Partner's skill", points: partnerPoints(input.partnerQualifies), max: 50 },
    {
      key: 'earnings',
      label: 'Victorian skilled earnings',
      points: input.location === 'offshore' ? 0 : earningsPoints(input.annualEarnings),
      max: 150,
    },
  ]
  return {
    total: categories.reduce((sum, c) => sum + c.points, 0),
    max: categories.reduce((sum, c) => sum + c.max, 0),
    categories,
  }
}

export function unsureFields(draft: VptDraft): ('skillLevel' | 'partnerQualifies')[] {
  const fields: ('skillLevel' | 'partnerQualifies')[] = []
  if (draft.skillLevel === 'unsure') fields.push('skillLevel')
  if (draft.partnerQualifies === 'unsure') fields.push('partnerQualifies')
  return fields
}

// Returns null while any answer is still skipped.
export function resolveDraft(draft: VptDraft): VptInput | null {
  if (draft.skillLevel === 'unsure' || draft.partnerQualifies === 'unsure') return null
  return draft as VptInput
}

// Lowest and highest score a draft can reach. Both are equal once every answer is known.
export function calculateRange(draft: VptDraft): { low: VptResult; high: VptResult; exact: boolean } {
  const low = calculateVpt({
    ...draft,
    skillLevel: draft.skillLevel === 'unsure' ? 3 : draft.skillLevel,
    partnerQualifies: draft.partnerQualifies === 'unsure' ? false : draft.partnerQualifies,
  })
  const high = calculateVpt({
    ...draft,
    skillLevel: draft.skillLevel === 'unsure' ? 1 : draft.skillLevel,
    partnerQualifies: draft.partnerQualifies === 'unsure' ? true : draft.partnerQualifies,
  })
  return { low, high, exact: unsureFields(draft).length === 0 }
}

const LOCATION: readonly string[] = ['onshore', 'offshore']
const ENGLISH: readonly string[] = ['competent', 'proficient', 'superior']
const EDUCATION: readonly string[] = ['other', 'bachelors', 'masters', 'phd']

// Validates untrusted JSON (edge function request body). Returns null when invalid.
export function parseVptInput(raw: unknown): VptInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const int = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  if (typeof r.location !== 'string' || !LOCATION.includes(r.location)) return null
  if (!int(r.age, 14, 99)) return null
  if (typeof r.english !== 'string' || !ENGLISH.includes(r.english)) return null
  if (!int(r.experienceYears, 0, 60)) return null
  if (typeof r.education !== 'string' || !EDUCATION.includes(r.education)) return null
  if (r.skillLevel !== 1 && r.skillLevel !== 2 && r.skillLevel !== 3) return null
  if (typeof r.partnerQualifies !== 'boolean') return null
  if (!int(r.annualEarnings, 0, 10_000_000)) return null
  return r as unknown as VptInput
}

// The youngest age at which the form assumes a candidate could have started skilled work.
const WORKING_AGE_MIN = 15

export type PlausibilityIssue = 'earnings_too_high' | 'experience_exceeds_age'

// Catches answers that pass the range checks but cannot be true. The server runs it before saving, so a forged
// request cannot push a false score into the ranking charts.
export function plausibilityIssue(input: VptInput): PlausibilityIssue | null {
  if (input.annualEarnings > EARNINGS_INPUT_MAX) return 'earnings_too_high'
  if (input.experienceYears > input.age - WORKING_AGE_MIN) return 'experience_exceeds_age'
  return null
}
