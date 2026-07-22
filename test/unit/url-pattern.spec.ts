import { describe, expect, it } from 'vitest'
import { rou3PatternToURLPattern } from '../../src'

function convert(pattern: string, segment?: 'strict' | 'loose') {
  return rou3PatternToURLPattern(pattern, segment ? { segment } : undefined).pattern
}

describe('rou3PatternToURLPattern', () => {
  it('leaves static segments untouched', () => {
    expect(convert('/foo/bar')).toBe('/foo/bar')
  })

  it('passes named params through unchanged', () => {
    expect(convert('/users/:id')).toBe('/users/:id')
    expect(convert('/users/:id/posts/:slug')).toBe('/users/:id/posts/:slug')
  })

  it('passes constrained params through unchanged', () => {
    expect(convert('/users/:id(\\d+)')).toBe('/users/:id(\\d+)')
    expect(convert('/files/:ext(png|jpg)')).toBe('/files/:ext(png|jpg)')
  })

  it('passes param modifiers through unchanged', () => {
    expect(convert('/users/:id?')).toBe('/users/:id?')
    expect(convert('/files/:path+')).toBe('/files/:path+')
    expect(convert('/files/:path*')).toBe('/files/:path*')
  })

  it('passes unnamed and non-capturing groups through unchanged', () => {
    expect(convert('/path/(\\d+)')).toBe('/path/(\\d+)')
    expect(convert('/path/(\\d+)?')).toBe('/path/(\\d+)?')
    expect(convert('/book{s}?')).toBe('/book{s}?')
  })

  it('preserves nested and escaped syntax inside groups', () => {
    expect(convert('/users/:id((a)b)')).toBe('/users/:id((a)b)')
    expect(convert('/foo{a\\}b}')).toBe('/foo{a\\}b}')
  })

  it('tolerates an unterminated constraint group', () => {
    expect(convert('/users/:id(unterminated')).toBe('/users/:id(unterminated')
  })

  it('translates single-segment wildcards', () => {
    expect(convert('/files/*')).toBe('/files/([^/]*)')
    expect(convert('/files/*.png')).toBe('/files/([^/]*).png')
  })

  it('translates catch-alls to URLPattern greedy wildcard', () => {
    expect(convert('/blog/**')).toBe('/blog/*')
    expect(convert('/blog/**:rest')).toBe('/blog/*')
  })

  it('handles a mix of segment kinds', () => {
    expect(convert('/api/:v/users/*/**')).toBe('/api/:v/users/([^/]*)/*')
  })

  it('leaves escaped tokens as literals', () => {
    expect(convert('/static\\:path/\\*')).toBe('/static\\:path/\\*')
  })

  it('tolerates a trailing backslash', () => {
    expect(convert('/foo\\')).toBe('/foo\\')
  })

  it('supports loose (Nuxt-style) segment mapping', () => {
    expect(convert('/users/:id', 'loose')).toBe('/users/*')
    expect(convert('/files/*', 'loose')).toBe('/files/*')
    expect(convert('/blog/**:rest', 'loose')).toBe('/blog/*')
    expect(convert('/path/(\\d+)', 'loose')).toBe('/path/*')
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
      expect(rou3PatternToURLPattern('/users/:id(\\d+)').issues).toEqual([])
      expect(rou3PatternToURLPattern('/files/:path+').issues).toEqual([])
    })

    it('reports the widening of a named param in loose mode', () => {
      const { issues } = rou3PatternToURLPattern('/users/:id', { segment: 'loose' })
      expect(issues).toMatchObject([{ type: 'widened', param: 'id' }])
    })

    it('reports the widening of a single-segment wildcard in loose mode', () => {
      const { issues } = rou3PatternToURLPattern('/files/*', { segment: 'loose' })
      expect(issues).toMatchObject([{ type: 'widened' }])
    })

    it('reports the widening of an unnamed group in loose mode', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/path/(\\d+)', { segment: 'loose' })
      expect(pattern).toBe('/path/*')
      expect(issues).toMatchObject([{ type: 'widened' }])
    })

    it('reports repeating groups whose cross-segment semantics differ', () => {
      const { pattern, issues } = rou3PatternToURLPattern('/book{s}+')
      expect(pattern).toBe('/book{s}+')
      expect(issues).toMatchObject([{ type: 'widened' }])
    })
  })
})
