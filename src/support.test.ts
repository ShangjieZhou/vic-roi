// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadMinimized, saveMinimized } from './support'

beforeEach(() => localStorage.clear())

describe('minimized support card', () => {
  it('starts open', () => expect(loadMinimized()).toBe(false))

  it('remembers a minimize, and an expand', () => {
    saveMinimized(true)
    expect(loadMinimized()).toBe(true)
    saveMinimized(false)
    expect(loadMinimized()).toBe(false)
  })
})
