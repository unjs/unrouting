import { addRoute, createRouter, findRoute } from 'rou3'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { toRegExp, toRou3, toVueRouter4 } from '../../src'

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
})
