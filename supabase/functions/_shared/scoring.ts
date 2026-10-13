// Victorian Points Test (VPT) 2026-27 scoring rules.
// Shared by the browser (instant results) and the edge function (server-side recompute before saving).
// Keep this file dependency-free so both Vite and Deno can import it.

export type EnglishLevel = 'competent' | 'proficient' | 'superior'
export type EducationLevel = 'other' | 'bachelors' | 'masters' | 'phd'
export type SkillLevel = 1 | 2 | 3

export interface VptInput {
  age: number
  english: EnglishLevel
  experienceYears: number
  education: EducationLevel
  skillLevel: SkillLevel
  partnerQualifies: boolean
  annualEarnings: number
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

// The published bands overlap ("1 year", "1-3 years", "3-5 years") and skip 5 to 6.
// Whole years are resolved to the first matching band: 1 -> 20, 2-3 -> 40, 4-5 -> 60, 6-8 -> 80, 9+ -> 100.
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

export function calculateVpt(input: VptInput): VptResult {
  const categories: CategoryScore[] = [
    { key: 'age', label: 'Age', points: agePoints(input.age), max: 300 },
    { key: 'english', label: 'English language', points: ENGLISH_POINTS[input.english], max: 200 },
    { key: 'experience', label: 'Experience in nominated occupation', points: experiencePoints(input.experienceYears), max: 100 },
    { key: 'education', label: 'Education', points: EDUCATION_POINTS[input.education], max: 100 },
    { key: 'skillLevel', label: 'Occupation skill level', points: skillLevelPoints(input.skillLevel), max: 50 },
    { key: 'partner', label: "Partner's skill", points: partnerPoints(input.partnerQualifies), max: 50 },
    { key: 'earnings', label: 'Victorian skilled earnings', points: earningsPoints(input.annualEarnings), max: 150 },
  ]
  return {
    total: categories.reduce((sum, c) => sum + c.points, 0),
    max: categories.reduce((sum, c) => sum + c.max, 0),
    categories,
  }
}

const ENGLISH: readonly string[] = ['competent', 'proficient', 'superior']
const EDUCATION: readonly string[] = ['other', 'bachelors', 'masters', 'phd']

// Validates untrusted JSON (edge function request body). Returns null when invalid.
export function parseVptInput(raw: unknown): VptInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const int = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  if (!int(r.age, 14, 99)) return null
  if (typeof r.english !== 'string' || !ENGLISH.includes(r.english)) return null
  if (!int(r.experienceYears, 0, 60)) return null
  if (typeof r.education !== 'string' || !EDUCATION.includes(r.education)) return null
  if (r.skillLevel !== 1 && r.skillLevel !== 2 && r.skillLevel !== 3) return null
  if (typeof r.partnerQualifies !== 'boolean') return null
  if (!int(r.annualEarnings, 0, 10_000_000)) return null
  return r as unknown as VptInput
}
