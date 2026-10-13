import type { EnglishLevel } from '../supabase/functions/_shared/scoring'

// Minimum score in each of the four components, for tests taken on or after 7 August 2025.
// Source: the Department of Home Affairs English language pages, Table 1 on each page (checked 14 October 2026).
// A candidate must reach every component. Tests taken on or before 6 August 2025 follow an older table (Table 2).
export const ENGLISH_TABLE_FROM = '7 August 2025'

// Listening, Reading, Writing, Speaking.
export type Scores = readonly [number, number, number, number]
export interface TestRequirement {
  test: string
  scores: Scores
}

export const ENGLISH_REQUIREMENTS: Record<EnglishLevel, TestRequirement[]> = {
  competent: [
    { test: 'PTE Academic', scores: [47, 48, 51, 54] },
    { test: 'IELTS Academic / General', scores: [6, 6, 6, 6] },
    { test: 'TOEFL iBT', scores: [16, 16, 19, 19] },
    { test: 'Cambridge C1 Advanced', scores: [163, 163, 170, 179] },
    { test: 'CELPIP General', scores: [7, 7, 7, 7] },
    { test: 'OET', scores: [290, 310, 290, 330] },
    { test: 'LANGUAGECERT Academic', scores: [57, 60, 64, 70] },
    { test: 'MET', scores: [56, 55, 57, 48] },
  ],
  proficient: [
    { test: 'PTE Academic', scores: [58, 59, 69, 76] },
    { test: 'IELTS Academic / General', scores: [7, 7, 7, 7] },
    { test: 'TOEFL iBT', scores: [22, 22, 26, 24] },
    { test: 'Cambridge C1 Advanced', scores: [175, 179, 193, 194] },
    { test: 'CELPIP General', scores: [9, 8, 10, 8] },
    { test: 'OET', scores: [350, 360, 380, 360] },
    { test: 'LANGUAGECERT Academic', scores: [67, 71, 78, 82] },
    { test: 'MET', scores: [61, 63, 74, 59] },
  ],
  superior: [
    { test: 'PTE Academic', scores: [69, 70, 85, 88] },
    { test: 'IELTS Academic / General', scores: [8, 8, 8, 8] },
    { test: 'TOEFL iBT', scores: [26, 27, 30, 28] },
    { test: 'Cambridge C1 Advanced', scores: [186, 190, 210, 208] },
    { test: 'CELPIP General', scores: [10, 10, 12, 10] },
    { test: 'OET', scores: [390, 400, 420, 400] },
    { test: 'LANGUAGECERT Academic', scores: [80, 83, 89, 89] },
  ],
}

const BASE = 'https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language'
// The official page for each level.
export const ENGLISH_SOURCE: Record<EnglishLevel, string> = {
  competent: `${BASE}/competent-english`,
  proficient: `${BASE}/proficient-english`,
  superior: `${BASE}/superior-english`,
}
