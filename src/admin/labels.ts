import type { Row } from './types'

export const DIMENSIONS: { key: string; title: string; order?: string[] }[] = [
  { key: 'location', title: 'Location', order: ['onshore', 'offshore'] },
  { key: 'age', title: 'Age', order: ['18-24', '25-32', '33-39', '40-44', '45+'] },
  { key: 'english', title: 'English level', order: ['competent', 'proficient', 'superior'] },
  { key: 'education', title: 'Education', order: ['other', 'bachelors', 'masters', 'phd'] },
  { key: 'skill', title: 'Occupation skill level', order: ['1', '2', '3'] },
  { key: 'experience', title: 'Experience in nominated occupation', order: ['0', '1', '2', '4', '6', '9'] },
  { key: 'earnings', title: 'Annual earnings (AUD)', order: ['0', '1-79,999', '80,000-99,999', '100,000-129,999', '130,000-169,999', '170,000+'] },
  { key: 'partner', title: "Partner's skill", order: ['yes', 'no'] },
]

const LABELS: Record<string, Record<string, string>> = {
  location: { onshore: 'Onshore', offshore: 'Offshore' },
  english: { competent: 'Competent', proficient: 'Proficient', superior: 'Superior' },
  education: { other: 'Other qualification', bachelors: "Bachelor's or Honours", masters: "Master's", phd: 'Doctorate' },
  skill: { '1': 'Skill level 1', '2': 'Skill level 2', '3': 'Skill level 3' },
  experience: { '0': '0 years', '1': '1 year', '2': '2 to 3 years', '4': '4 to 5 years', '6': '6 to 7 years', '9': 'More than 8 years' },
  earnings: { '0': 'No income' },
  partner: { yes: 'Partner qualifies', no: 'No qualifying partner' },
}

export function labelFor(dimension: string, key: string): string {
  return LABELS[dimension]?.[key] ?? key
}

// Rows in the natural order of the answer, with any unexpected value last.
export function orderRows(dimension: string, rows: Row[]): Row[] {
  const order = DIMENSIONS.find((d) => d.key === dimension)?.order ?? []
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length)
  return [...rows].sort((a, b) => rank(a.k) - rank(b.k))
}

export const SECTION_LABELS: Record<string, string> = {
  age: 'Age',
  english: 'English language',
  experience: 'Experience',
  education: 'Education',
  skillLevel: 'Occupation skill level',
  partner: "Partner's skill",
  earnings: 'Earnings',
}

// The first digit of an ANZSCO code.
export const OCCUPATION_GROUPS: Record<string, string> = {
  '1': 'Managers',
  '2': 'Professionals',
  '3': 'Technicians and trades workers',
  '4': 'Community and personal service workers',
  '5': 'Clerical and administrative workers',
  '6': 'Sales workers',
  '7': 'Machinery operators and drivers',
  '8': 'Labourers',
}

export const percent = (part: number, whole: number): string => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '0%')

export function melbourne(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}
