import { describe, expect, it } from 'vitest'
import { assessmentFor } from './assessment'

describe('assessmentFor', () => {
  it.each([
    [1, 'outstanding'], [5, 'outstanding'],
    [6, 'veryCompetitive'], [10, 'veryCompetitive'],
    [11, 'competitive'], [25, 'competitive'],
    [26, 'aboveAverage'], [50, 'aboveAverage'],
    [51, 'average'], [75, 'average'],
    [76, 'belowAverage'], [100, 'belowAverage'],
  ])('top %i%% is %s', (top, key) => expect(assessmentFor(top).key).toBe(key))

  it('gives each of the six outcomes its own badge colour', () => {
    const tones = [5, 10, 25, 50, 75, 100].map((t) => assessmentFor(t).tone)
    expect(new Set(tones).size).toBe(6)
  })
})
