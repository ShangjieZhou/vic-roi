import { describe, expect, it } from 'vitest'
import { hideResultId } from './analytics'

const ID = '9a1b2c3d-1111-4222-8333-444455556666'
const view = (url: string) => hideResultId({ type: 'pageview', url }) as { url: string }

describe('hideResultId', () => {
  it('replaces the submission id in a result link', () => {
    expect(view(`https://vic-roi.vercel.app/r/${ID}`).url).toBe('https://vic-roi.vercel.app/r/:id')
  })

  it('drops the query string and hash', () => {
    expect(view('https://vic-roi.vercel.app/?utm=x#top').url).toBe('https://vic-roi.vercel.app/')
  })

  it('leaves other paths alone', () => {
    expect(view('https://vic-roi.vercel.app/').url).toBe('https://vic-roi.vercel.app/')
  })
})
