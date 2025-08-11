import { addRoute, createRouter, findRoute } from 'rou3'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { parsePath, toRegExp, toRou3, toVueRouter4 } from '../../src'

describe('rou3 support', () => {
  const paths = {
    'file.vue': '/file',
    'index.vue': '/',
    'foo/index.vue': '/foo',
    'test.html.vue': '/test.html',
    '[slug].vue': '/file',
    '/file/[...slug].vue': '/file/here/we/go',
    '[a1_1a].vue': '/file',
    '[b2.2b].vue': '/file',
    // TODO: mixed parameters are not (yet?) supported in rou3
    // 'test:name.vue': '/test:name',
    // '[b2]_[2b].vue': '/fi_le',
    // TODO: optional parameters are not (yet?) supported in rou3
    // '[[foo]]/index.vue': '/some',
    // '[[sub]]/route-[slug].vue': '/some/route-value',
    // 'optional/[[opt]].vue': '/optional',
    // 'optional/prefix-[[opt]].vue': '/optional/prefix-test',
    // 'optional/[[opt]]-postfix.vue': '/optional/some-postfix',
    // 'optional/prefix-[[opt]]-postfix.vue': '/optional/prefix--postfix',
    // '[[c3@3c]].vue': '/file',
    // '[[d4-4d]].vue': '/file',
  }

  it('toRou3', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const router = createRouter<{ value: string }>()
      addRoute(router, 'GET', toRou3([path])[0], { value: example })
      const result = findRoute(router, 'GET', example)
      // Return params if available (for dynamic routes), otherwise return the value from data
      return [path, result?.params || result?.data.value]
    }))

    expect(result).toMatchInlineSnapshot(`
      {
        "/file/[...slug].vue": {
          "slug": "here/we/go",
        },
        "[a1_1a].vue": {
          "a1_1a": "file",
        },
        "[b2.2b].vue": {
          "b2.2b": "file",
        },
        "[slug].vue": {
          "slug": "file",
        },
        "file.vue": "/file",
        "foo/index.vue": "/foo",
        "index.vue": "/",
        "test.html.vue": "/test.html",
      }
    `)
  })

  it('should throw error for optional parameters', () => {
    expect(() => toRou3(['[[optional]].vue'])).toThrow('[unrouting] `toRou3` does not support optional parameters')
  })

  it('should throw error for repeatable parameters', () => {
    expect(() => toRou3(['[slug]+.vue'])).toThrow('[unrouting] `toRou3` does not support repeatable parameters')
  })

  it('should throw error for optional-repeatable parameters', () => {
    expect(() => toRou3(['[[slug]]+.vue'])).toThrow('[unrouting] `toRou3` does not support optional repeatable parameters')
  })

  it('should handle dynamic parameters without value', () => {
    // Test dynamic token without value (should generate '*') - manually create a parsed path
    const parsedPath = {
      segments: [[{ type: 'dynamic' as const, value: '' }]],
      meta: undefined,
    }
    const result = toRou3([parsedPath])
    expect(result).toEqual(['/*'])
  })

  it('should handle catchall parameters without value', () => {
    // Test catchall token without value (should generate '**') - manually create a parsed path
    const parsedPath = {
      segments: [[{ type: 'catchall' as const, value: '' }]],
      meta: undefined,
    }
    const result = toRou3([parsedPath])
    expect(result).toEqual(['/**'])
  })

  it('should handle group-only segments', () => {
    // Test segments that only contain group tokens (should be skipped)
    const result = toRou3(['(group).vue'])
    expect(result).toEqual(['/'])
  })

  it('should handle empty segments', () => {
    // Test segments that result in empty rou3Segment (should be skipped)
    const result = toRou3(['file//index.vue'])
    expect(result).toEqual(['/file'])
  })

  it('should work with ParsedPath objects', () => {
    // Test using ParsedPath objects instead of strings
    const parsedPaths = parsePath(['[slug].vue'])
    const result = toRou3(parsedPaths)
    expect(result).toEqual(['/:slug'])
  })
})

describe('regexp support', () => {
  const paths = {
    'file.vue': '/file',
    'test.html.vue': '/test.html',
    '[slug].vue': '/file',
    'index.vue': '/',
    'foo/index.vue': '/foo',
    '[...slug].vue': '/file/here/we/go',
    '[[foo]]/index.vue': '/some',
    '[[sub]]/route-[slug].vue': '/some/route-value',
    'optional/[[opt]].vue': '/optional',
    'optional/prefix-[[opt]].vue': '/optional/prefix-test',
    'optional/[[opt]]-postfix.vue': '/optional/some-postfix',
    'optional/prefix-[[opt]]-postfix.vue': '/optional/prefix--postfix',
    '[a1_1a].vue': '/file',
    '[b2.2b].vue': '/file',
    '[b2]_[2b].vue': '/fi_le',
    '[[c3@3c]].vue': '/file',
    '[[d4-4d]].vue': '/file',
    'test:name.vue': '/test:name',
    '[slug]+.vue': '/file/here/we/go',
    '[[slug]]+.vue': '/file/here/we/go',
    'articles/[slug]+.vue': '/articles/here/we/go',
  }

  it('toRegExp', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const regexpResult = toRegExp([path])[0]
      const match = example.match(regexpResult.pattern)
      return [path, {
        regexp: regexpResult.pattern.toString(),
        result: match?.groups || match?.[0],
      }]
    }))
    expect(result).toMatchInlineSnapshot(`
      {
        "[...slug].vue": {
          "regexp": "/^(?:\\/(?<slug>.*))?\\/?$/",
          "result": {
            "slug": "file/here/we/go",
          },
        },
        "[[c3@3c]].vue": {
          "regexp": "/^(?:\\/(?<c33c>[^/]*))?\\/?$/",
          "result": {
            "c33c": "file",
          },
        },
        "[[d4-4d]].vue": {
          "regexp": "/^(?:\\/(?<d44d>[^/]*))?\\/?$/",
          "result": {
            "d44d": "file",
          },
        },
        "[[foo]]/index.vue": {
          "regexp": "/^(?:\\/(?<foo>[^/]*))?\\/?$/",
          "result": {
            "foo": "some",
          },
        },
        "[[slug]]+.vue": {
          "regexp": "/^(?:\\/(?<slug>[^/]*(?:\\/[^/]+)*))?\\/?$/",
          "result": {
            "slug": "file/here/we/go",
          },
        },
        "[[sub]]/route-[slug].vue": {
          "regexp": "/^(?:\\/(?<sub>[^/]*))?\\/route\\x2d(?<slug>[^/]+)\\/?$/",
          "result": {
            "slug": "value",
            "sub": "some",
          },
        },
        "[a1_1a].vue": {
          "regexp": "/^\\/(?<a1_1a>[^/]+)\\/?$/",
          "result": {
            "a1_1a": "file",
          },
        },
        "[b2.2b].vue": {
          "regexp": "/^\\/(?<b22b>[^/]+)\\/?$/",
          "result": {
            "b22b": "file",
          },
        },
        "[b2]_[2b].vue": {
          "regexp": "/^\\/(?<b2>[^/]+)_(?<_2b>[^/]+)\\/?$/",
          "result": {
            "_2b": "le",
            "b2": "fi",
          },
        },
        "[slug]+.vue": {
          "regexp": "/^\\/(?<slug>[^/]+(?:\\/[^/]+)*)\\/?$/",
          "result": {
            "slug": "file/here/we/go",
          },
        },
        "[slug].vue": {
          "regexp": "/^\\/(?<slug>[^/]+)\\/?$/",
          "result": {
            "slug": "file",
          },
        },
        "articles/[slug]+.vue": {
          "regexp": "/^\\/articles\\/(?<slug>[^/]+(?:\\/[^/]+)*)\\/?$/",
          "result": {
            "slug": "here/we/go",
          },
        },
        "file.vue": {
          "regexp": "/^\\/file\\/?$/",
          "result": "/file",
        },
        "foo/index.vue": {
          "regexp": "/^\\/foo\\/?$/",
          "result": "/foo",
        },
        "index.vue": {
          "regexp": "/^\\/?$/",
          "result": "/",
        },
        "optional/[[opt]]-postfix.vue": {
          "regexp": "/^\\/optional\\/(?<opt>[^/]*)\\x2dpostfix\\/?$/",
          "result": {
            "opt": "some",
          },
        },
        "optional/[[opt]].vue": {
          "regexp": "/^\\/optional(?:\\/(?<opt>[^/]*))?\\/?$/",
          "result": {
            "opt": undefined,
          },
        },
        "optional/prefix-[[opt]]-postfix.vue": {
          "regexp": "/^\\/optional\\/prefix\\x2d(?<opt>[^/]*)\\x2dpostfix\\/?$/",
          "result": {
            "opt": "",
          },
        },
        "optional/prefix-[[opt]].vue": {
          "regexp": "/^\\/optional\\/prefix\\x2d(?<opt>[^/]*)\\/?$/",
          "result": {
            "opt": "test",
          },
        },
        "test.html.vue": {
          "regexp": "/^\\/test\\.html\\/?$/",
          "result": "/test.html",
        },
        "test:name.vue": {
          "regexp": "/^\\/test:name\\/?$/",
          "result": "/test:name",
        },
      }
    `)
  })
})

describe('vue-router support', () => {
  const paths = {
    'file.vue': '/file',
    'test.html.vue': '/test.html',
    '[slug].vue': '/file',
    'index.vue': '/',
    'foo/index.vue': '/foo',
    '[...slug].vue': '/file/here/we/go',
    '[[foo]]/index.vue': '/some',
    '[[sub]]/route-[slug].vue': '/some/route-value',
    'optional/[[opt]].vue': '/optional',
    'optional/prefix-[[opt]].vue': '/optional/prefix-test',
    'optional/[[opt]]-postfix.vue': '/optional/some-postfix',
    'optional/prefix-[[opt]]-postfix.vue': '/optional/prefix--postfix',
    '[a1_1a].vue': '/file',
    // TODO: should this be allowed?
    // '[b2.2b].vue': '/file',
    '[b2]_[2b].vue': '/fi_le',
    '[[c3@3c]].vue': '/file',
    '[[d4-4d]].vue': '/file',
    'test:name.vue': '/test:name',
    '[slug]+.vue': '/file/here/we/go',
    '[[slug]]+.vue': '/file/here/we/go',
    'articles/[slug]+.vue': '/articles/here/we/go',
  }

  it('toVueRouter4', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const route = toVueRouter4([path])[0]
      const router = createVueRouter({
        history: createMemoryHistory(),
        routes: [{
          ...route,
          component: () => ({}),
          meta: {
            value: example,
          },
        }],
      })
      const result = router.resolve(example)
      return [path, result?.meta.value && result.params]
    }))
    expect(result).toMatchInlineSnapshot(`
      {
        "[...slug].vue": {
          "slug": [
            "file",
            "here",
            "we",
            "go",
          ],
        },
        "[[c3@3c]].vue": {
          "c33c": "file",
        },
        "[[d4-4d]].vue": {
          "d44d": "file",
        },
        "[[foo]]/index.vue": {
          "foo": "some",
        },
        "[[slug]]+.vue": {
          "slug": [
            "file",
            "here",
            "we",
            "go",
          ],
        },
        "[[sub]]/route-[slug].vue": {
          "slug": "value",
          "sub": "some",
        },
        "[a1_1a].vue": {
          "a1_1a": "file",
        },
        "[b2]_[2b].vue": {
          "2b": "le",
          "b2": "fi",
        },
        "[slug]+.vue": {
          "slug": [
            "file",
            "here",
            "we",
            "go",
          ],
        },
        "[slug].vue": {
          "slug": "file",
        },
        "articles/[slug]+.vue": {
          "slug": [
            "here",
            "we",
            "go",
          ],
        },
        "file.vue": {},
        "foo/index.vue": {},
        "index.vue": {},
        "optional/[[opt]]-postfix.vue": {
          "opt": "some",
        },
        "optional/[[opt]].vue": {
          "opt": "",
        },
        "optional/prefix-[[opt]]-postfix.vue": {
          "opt": "",
        },
        "optional/prefix-[[opt]].vue": {
          "opt": "test",
        },
        "test.html.vue": {},
        "test:name.vue": {},
      }
    `)
  })

  it('should handle catchall patterns', () => {
    const patterns = [
      '[...slug].vue',
      'prefix/[...slug].vue',
      '[...slug]/suffix.vue',
      'prefix/[...slug]/suffix.vue',
    ]
    const result = toVueRouter4(patterns)
    expect(result.map(m => m.path)).toMatchInlineSnapshot(`
      [
        "/:slug(.*)*",
        "/prefix/:slug(.*)*",
        "/:slug([^/]*)*/suffix",
        "/prefix/:slug([^/]*)*/suffix",
      ]
    `)
  })

  it('should work with ParsedPath objects', () => {
    // Test using ParsedPath objects instead of strings
    const parsedPaths = parsePath(['[slug].vue'])
    const result = toVueRouter4(parsedPaths)
    expect(result).toEqual([{ path: '/:slug()' }])
  })

  it('should handle group segments', () => {
    // Test segments that only contain group tokens (should be skipped)
    const [pure, mixed] = toVueRouter4(['(group).vue', '(group)[slug].vue'])
    expect(pure).toEqual({ path: '/' })
    expect(mixed).toEqual({ path: '/:slug()' })
  })

  it('should handle empty segments', () => {
    // Test segments that result in empty pathSegment (should be skipped)
    const result = toVueRouter4(['file//index.vue'])
    expect(result).toEqual([{ path: '/file' }])
  })
})

describe('toRegExp pattern matching', () => {
  it('should only match exact path patterns', () => {
    const [result] = toRegExp(['[slug].vue'])

    // Should match single-segment paths
    expect('/file'.match(result.pattern)).toBeTruthy()
    expect('/file'.match(result.pattern)?.groups?.slug).toBe('file')

    expect('/test'.match(result.pattern)).toBeTruthy()
    expect('/test'.match(result.pattern)?.groups?.slug).toBe('test')

    // Should NOT match multi-segment paths
    expect('/test/thing'.match(result.pattern)).toBeFalsy()
    expect('/multiple/segments'.match(result.pattern)).toBeFalsy()

    // Should NOT match paths without leading slash
    expect('file'.match(result.pattern)).toBeFalsy()

    // Should NOT match empty path
    expect(''.match(result.pattern)).toBeFalsy()
  })

  it('should properly match nested dynamic routes', () => {
    const [result] = toRegExp(['users/[id]/posts/[slug].vue'])

    // Should match the exact pattern
    expect('/users/123/posts/hello'.match(result.pattern)).toBeTruthy()
    expect('/users/abc/posts/world'.match(result.pattern)?.groups).toEqual({
      id: 'abc',
      slug: 'world',
    })

    // Should NOT match partial patterns
    expect('/users/123'.match(result.pattern)).toBeFalsy()
    expect('/users/123/posts'.match(result.pattern)).toBeFalsy()
    expect('/posts/hello'.match(result.pattern)).toBeFalsy()

    // Should NOT match with extra segments
    expect('/users/123/posts/hello/extra'.match(result.pattern)).toBeFalsy()
  })

  it('should handle optional parameters correctly', () => {
    const [result] = toRegExp(['products/[[category]].vue'])

    // Should match with parameter
    expect('/products/electronics'.match(result.pattern)).toBeTruthy()
    expect('/products/electronics'.match(result.pattern)?.groups?.category).toBe('electronics')

    // Should match without parameter
    expect('/products'.match(result.pattern)).toBeTruthy()
    expect('/products/'.match(result.pattern)).toBeTruthy()

    // Should NOT match extra segments
    expect('/products/electronics/phones'.match(result.pattern)).toBeFalsy()
  })

  it('should handle catchall routes correctly', () => {
    const [result] = toRegExp(['docs/[...slug].vue'])

    // Should match single segment
    expect('/docs/intro'.match(result.pattern)).toBeTruthy()
    expect('/docs/intro'.match(result.pattern)?.groups?.slug).toBe('intro')

    // Should match multiple segments
    expect('/docs/guide/getting-started'.match(result.pattern)).toBeTruthy()
    expect('/docs/guide/getting-started'.match(result.pattern)?.groups?.slug).toBe('guide/getting-started')

    // Should match empty catchall
    expect('/docs'.match(result.pattern)).toBeTruthy()
    expect('/docs/'.match(result.pattern)).toBeTruthy()

    // Should NOT match without base path
    expect('/guide/getting-started'.match(result.pattern)).toBeFalsy()
  })

  it('should handle repeatable parameters correctly', () => {
    const [result] = toRegExp(['posts/[slug]+.vue'])

    // Should match single segment
    expect('/posts/hello'.match(result.pattern)).toBeTruthy()
    expect('/posts/hello'.match(result.pattern)?.groups?.slug).toBe('hello')

    // Should match multiple segments
    expect('/posts/hello/world/test'.match(result.pattern)).toBeTruthy()
    expect('/posts/hello/world/test'.match(result.pattern)?.groups?.slug).toBe('hello/world/test')

    // Should NOT match empty
    expect('/posts'.match(result.pattern)).toBeFalsy()
    expect('/posts/'.match(result.pattern)).toBeFalsy()
  })

  it('should handle optional repeatable parameters correctly', () => {
    const [result] = toRegExp(['articles/[[slug]]+.vue'])

    // Should match single segment
    expect('/articles/hello'.match(result.pattern)).toBeTruthy()
    expect('/articles/hello'.match(result.pattern)?.groups?.slug).toBe('hello')

    // Should match multiple segments
    expect('/articles/hello/world'.match(result.pattern)).toBeTruthy()
    expect('/articles/hello/world'.match(result.pattern)?.groups?.slug).toBe('hello/world')

    // Should match empty (optional)
    expect('/articles'.match(result.pattern)).toBeTruthy()
    expect('/articles/'.match(result.pattern)).toBeTruthy()
  })

  it('should work with ParsedPath objects', () => {
    // Test using ParsedPath objects instead of strings
    const parsedPaths = parsePath(['[slug].vue'])
    const result = toRegExp(parsedPaths)
    expect(result[0].pattern.toString()).toBe('/^\\/(?<slug>[^/]+)\\/?$/')
    expect(result[0].keys).toEqual(['slug'])
  })

  it('should handle group-only segments', () => {
    // Test segments that only contain group tokens (should be skipped)
    const result = toRegExp(['(group).vue'])
    expect(result[0].pattern.toString()).toBe('/^\\/?$/')
    expect(result[0].keys).toEqual([])
  })

  it('should sanitize capture group names with numbers and dots', () => {
    // Test parameter names that start with numbers (should be prefixed with _)
    const result1 = toRegExp(['[1param].vue'])
    expect(result1[0].keys).toEqual(['_1param'])

    // Test parameter names with dots (should be removed)
    const result2 = toRegExp(['[param.name].vue'])
    expect(result2[0].keys).toEqual(['paramname'])

    // Test parameter names with both numbers and dots
    const result3 = toRegExp(['[1param.name].vue'])
    expect(result3[0].keys).toEqual(['_1paramname'])
  })

  it('should handle optional segments correctly', () => {
    // Test optional segments
    const result = toRegExp(['optional/[[param]]/more.vue'])
    expect(result[0].pattern.toString()).toBe('/^\\/optional(?:\\/(?<param>[^/]*))?\\/more\\/?$/')
  })

  it('should handle static tokens with colons in Vue Router', () => {
    // Test static content with colons that need escaping - this should trigger the replace() logic
    const result = toVueRouter4(['file:with:multiple:colons.vue'])
    expect(result[0].path).toBe('/file\\:with\\:multiple\\:colons')

    // Test static content without colons to ensure both branches are covered
    const result2 = toVueRouter4(['file-without-colons.vue'])
    expect(result2[0].path).toBe('/file-without-colons')
  })

  it('should handle mixed static and dynamic tokens', () => {
    // Test a segment with only static tokens to ensure continue path is hit
    const result = toVueRouter4(['static-only-content.vue'])
    expect(result[0].path).toBe('/static-only-content')

    // Test a segment that mixes static and dynamic tokens
    const result2 = toVueRouter4(['static-[dynamic]-static.vue'])
    expect(result2[0].path).toBe('/static-:dynamic()-static')
  })
})
