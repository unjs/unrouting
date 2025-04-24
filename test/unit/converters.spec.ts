import { createRouter as createRadixRouter } from 'radix3'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { toRadix3, toRegExp, toVueRouter4 } from '../../src'

describe('radix3 support', () => {
  const paths = {
    'file.vue': '/file',
    'index.vue': '/',
    'foo/index.vue': '/foo',
    'test.html.vue': '/test.html',
    '[slug].vue': '/file',
    '/file/[...slug].vue': '/file/here/we/go',
    '[a1_1a].vue': '/file',
    '[b2.2b].vue': '/file',
    'test:name.vue': '/test:name',
    // TODO: mixed parameters are not (yet?) supported in radix3
    // '[b2]_[2b].vue': '/fi_le',
    // TODO: optional parameters are not (yet?) supported in radix3
    // '[[foo]]/index.vue': '/some',
    // '[[sub]]/route-[slug].vue': '/some/route-value',
    // 'optional/[[opt]].vue': '/optional',
    // 'optional/prefix-[[opt]].vue': '/optional/prefix-test',
    // 'optional/[[opt]]-postfix.vue': '/optional/some-postfix',
    // 'optional/prefix-[[opt]]-postfix.vue': '/optional/prefix--postfix',
    // '[[c3@3c]].vue': '/file',
    // '[[d4-4d]].vue': '/file',
  }

  it('toRadix3', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const routeMatcher = createRadixRouter()
      routeMatcher.insert(toRadix3(path), { value: example })
      const result = routeMatcher.lookup(example)
      return [path, result?.params || result?.value]
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
        "test:name.vue": "/test:name",
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
  }

  it('toRegExp', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const result = example.match(toRegExp(path))
      return [path, {
        regexp: toRegExp(path).toString(),
        result: result?.groups || result?.[0],
      }]
    }))
    expect(result).toMatchInlineSnapshot(`
      {
        "[...slug].vue": {
          "regexp": "/\\/(?:(?<slug>.*)\\/?)?/",
          "result": {
            "slug": "file/here/we/go",
          },
        },
        "[[c3@3c]].vue": {
          "regexp": "/\\/(?:(?<c33c>[^/]*)\\/?)?/",
          "result": {
            "c33c": "file",
          },
        },
        "[[d4-4d]].vue": {
          "regexp": "/\\/(?:(?<d44d>[^/]*)\\/?)?/",
          "result": {
            "d44d": "file",
          },
        },
        "[[foo]]/index.vue": {
          "regexp": "/\\/(?:(?<foo>[^/]*)\\/?)?/",
          "result": {
            "foo": "some",
          },
        },
        "[[sub]]/route-[slug].vue": {
          "regexp": "/\\/(?:(?<sub>[^/]*)\\/?)route\\x2d(?<slug>[^/]+)\\/?/",
          "result": {
            "slug": "value",
            "sub": "some",
          },
        },
        "[a1_1a].vue": {
          "regexp": "/\\/(?<a1_1a>[^/]+)\\/?/",
          "result": {
            "a1_1a": "file",
          },
        },
        "[b2.2b].vue": {
          "regexp": "/\\/(?<b22b>[^/]+)\\/?/",
          "result": {
            "b22b": "file",
          },
        },
        "[b2]_[2b].vue": {
          "regexp": "/\\/(?<b2>[^/]+)_(?<_2b>[^/]+)\\/?/",
          "result": {
            "_2b": "le",
            "b2": "fi",
          },
        },
        "[slug].vue": {
          "regexp": "/\\/(?<slug>[^/]+)\\/?/",
          "result": {
            "slug": "file",
          },
        },
        "file.vue": {
          "regexp": "/\\/file\\/?/",
          "result": "/file",
        },
        "foo/index.vue": {
          "regexp": "/\\/foo\\/?/",
          "result": "/foo",
        },
        "index.vue": {
          "regexp": "/\\/?/",
          "result": "/",
        },
        "optional/[[opt]]-postfix.vue": {
          "regexp": "/\\/optional\\/(?<opt>[^/]*)\\x2dpostfix\\/?/",
          "result": {
            "opt": "some",
          },
        },
        "optional/[[opt]].vue": {
          "regexp": "/\\/optional\\/(?:(?<opt>[^/]*)\\/?)?/",
          "result": undefined,
        },
        "optional/prefix-[[opt]]-postfix.vue": {
          "regexp": "/\\/optional\\/prefix\\x2d(?<opt>[^/]*)\\x2dpostfix\\/?/",
          "result": {
            "opt": "",
          },
        },
        "optional/prefix-[[opt]].vue": {
          "regexp": "/\\/optional\\/prefix\\x2d(?<opt>[^/]*)\\/?/",
          "result": {
            "opt": "test",
          },
        },
        "test.html.vue": {
          "regexp": "/\\/test\\.html\\/?/",
          "result": "/test.html",
        },
        "test:name.vue": {
          "regexp": "/\\/test:name\\/?/",
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
  }

  it('toVueRouter4', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const route = toVueRouter4(path)
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
        "[slug].vue": {
          "slug": "file",
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
