import { describe, expect, it } from 'vitest'
import { welcome } from '../src'

describe('unrouting', () => {
  it('works', () => {
    expect(welcome()).toMatchInlineSnapshot('"hello world"')
  })
})
