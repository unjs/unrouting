import { describe, expect, it } from 'vitest'
import { rou3PatternToURLPattern } from '../../src'

function convert(pattern: string, segment?: 'strict' | 'loose') {
  return rou3PatternToURLPattern(pattern, segment ? { segment } : undefined).pattern
}

describe('rou3PatternToURLPattern', () => {
  it('leaves static segments untouched', () => {
    expect(convert('/foo/bar')).toBe('/foo/bar')
  })

  it('converts named params to a single segment', () => {
    expect(convert('/users/:id')).toBe('/users/([^/]+)')
    expect(convert('/users/:id/posts/:slug')).toBe('/users/([^/]+)/posts/([^/]+)')
  })

  it('converts single-segment wildcards', () => {
    expect(convert('/files/*')).toBe('/files/([^/]*)')
    expect(convert('/files/*.png')).toBe('/files/([^/]*).png')
  })

  it('converts catch-alls to URLPattern greedy wildcard', () => {
    expect(convert('/blog/**')).toBe('/blog/*')
  })

  it('converts named catch-alls', () => {
    expect(convert('/blog/**:rest')).toBe('/blog/*')
  })

  it('converts optional params', () => {
    expect(convert('/users/:id?')).toBe('/users/([^/]+)?')
  })

  it('widens repeatable params to a catch-all', () => {
    expect(convert('/files/:path+')).toBe('/files/*')
    expect(convert('/files/:path*')).toBe('/files/*')
  })

  it('handles a mix of segment kinds', () => {
    expect(convert('/api/:v/users/*/**')).toBe('/api/([^/]+)/users/([^/]*)/*')
  })

  it('leaves escaped tokens as literals', () => {
    expect(convert('/static\\:path/\\*')).toBe('/static\\:path/\\*')
  })

  it('tolerates a trailing backslash', () => {
    expect(convert('/foo\\')).toBe('/foo\\')
  })

  it('drops a non-capturing group with no modifier', () => {
    expect(convert('/book{s}')).toBe('/book')
  })

  it('supports loose (Nuxt-style) segment mapping', () => {
    expect(convert('/users/:id', 'loose')).toBe('/users/*')
    expect(convert('/files/*', 'loose')).toBe('/files/*')
    expect(convert('/blog/**:rest', 'loose')).toBe('/blog/*')
  })

  it('matches the historical Nuxt inline conversion in loose mode', () => {
    const nuxtInline = (route: string) => route
      .replace(/\*\*:\w+/g, '*')
      .replace(/\*\*/g, '*')
      .replace(/:\w+/g, '*')
    for (const route of ['/blog/**', '/blog/**:rest', '/users/:id', '/a/:b/**:c']) {
      expect(convert(route, 'loose')).toBe(nuxtInline(route))
    }
  })

  describe('issues', () => {
    it('is empty for a faithful conversion', () => {
      expect(rou3PatternToURLPattern('/blog/**').issues).toEqual([])
      expect(rou3PatternToURLPattern('/users/:id').issues).toEqual([])
    })

    it('reports widening in loose mode', () => {
      const { issues } = rou3PatternToURLPattern('/users/:id', { segment: 'loose' })
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({ type: 'widened', param: 'id' })
    })

    it('reports widening for repeatable params', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/files/:path+')
      expect(pattern).toBe('/files/*')
      expect(issues).toMatchObject([{ type: 'widened', param: 'path' }])
    })

    it('reports dropped regexp constraints', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/users/:id(\\d+)')
      expect(pattern).toBe('/users/([^/]+)')
      expect(issues).toMatchObject([{ type: 'unsupported', param: 'id' }])
    })

    it('reports widening for optional params in loose mode', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/users/:id?', { segment: 'loose' })
      expect(pattern).toBe('/users/*')
      expect(issues).toMatchObject([{ type: 'widened', param: 'id' }])
    })

    it('reports unnamed groups', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/path/(\\d+)')
      expect(pattern).toBe('/path/([^/]*)')
      expect(issues).toMatchObject([{ type: 'unsupported' }])
    })

    it('widens unnamed groups to `*` in loose mode', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/path/(\\d+)', { segment: 'loose' })
      expect(pattern).toBe('/path/*')
      expect(issues).toMatchObject([{ type: 'unsupported' }])
    })

    it('reports unnamed groups carrying a modifier', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/path/(\\d+)?')
      expect(pattern).toBe('/path/([^/]*)')
      expect(issues).toMatchObject([{ type: 'unsupported' }])
    })

    it('tolerates an unterminated constraint group', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/users/:id(unterminated')
      expect(pattern).toBe('/users/([^/]+)')
      expect(issues).toMatchObject([{ type: 'unsupported', param: 'id' }])
    })

    it('skips over nested and escaped parens in a constraint body', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/users/:id(\\(a(b)\\))')
      expect(pattern).toBe('/users/([^/]+)')
      expect(issues).toMatchObject([{ type: 'unsupported', param: 'id' }])
    })

    it('reports non-capturing groups', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/book{s}?')
      expect(pattern).toBe('/book')
      expect(issues).toMatchObject([{ type: 'unsupported' }])
    })
  })
})
