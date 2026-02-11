import { addRoute, createRouter, findRoute } from 'rou3'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { buildTree, isPageNode, parsePath, toRegExp, toRou3, toVueRouter4, walkTree } from '../../src'

/** buildTree shorthand — accepts raw strings */
const tree = (paths: string[]) => buildTree(paths)

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
  }

  it('toRou3', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const router = createRouter<{ value: string }>()
      addRoute(router, 'GET', toRou3(tree([path]))[0].path, { value: example })
      const result = findRoute(router, 'GET', example)
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
    expect(() => toRou3(tree(['[[optional]].vue']))).toThrow('[unrouting] `toRou3` does not support optional parameters')
  })

  it('should throw error for repeatable parameters', () => {
    expect(() => toRou3(tree(['[slug]+.vue']))).toThrow('[unrouting] `toRou3` does not support repeatable parameters')
  })

  it('should throw error for optional-repeatable parameters', () => {
    expect(() => toRou3(tree(['[[slug]]+.vue']))).toThrow('[unrouting] `toRou3` does not support optional repeatable parameters')
  })

  it('should handle group-only segments', () => {
    expect(toRou3(tree(['(group).vue']))[0].path).toEqual('/')
  })

  it('should handle empty segments', () => {
    expect(toRou3(tree(['file//index.vue']))[0].path).toEqual('/file')
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
      const regexpResult = toRegExp(tree([path]))[0]
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
    '[b2]_[2b].vue': '/fi_le',
    '[[c3@3c]].vue': '/file',
    '[[d4-4d]].vue': '/file',
    'test:name.vue': '/test:name',
    '[slug]+.vue': '/file/here/we/go',
    '[[slug]]+.vue': '/file/here/we/go',
    'articles/[slug]+.vue': '/articles/here/we/go',
  }

  it('toVueRouter4 - resolves params correctly with actual vue-router', () => {
    const result = Object.fromEntries(Object.entries(paths).map(([path, example]) => {
      const route = toVueRouter4(tree([path]))[0]
      const router = createVueRouter({
        history: createMemoryHistory(),
        routes: [{
          ...route,
          component: () => ({}),
          meta: { value: example },
        }],
      })
      const resolved = router.resolve(example)
      return [path, resolved?.meta.value && resolved.params]
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
    const result = patterns.map(p => toVueRouter4(tree([p]))[0].path)
    expect(result).toMatchInlineSnapshot(`
      [
        "/:slug(.*)*",
        "/prefix/:slug(.*)*",
        "/:slug([^/]*)*/suffix",
        "/prefix/:slug([^/]*)*/suffix",
      ]
    `)
  })

  it('should handle group segments', () => {
    const result = toVueRouter4(tree(['(group).vue', '(group)[slug].vue']))
    expect(result.find(r => r.file === '(group).vue')?.path).toBe('/')
    expect(result.find(r => r.file === '(group)[slug].vue')?.path).toBe('/:slug()')
  })

  it('should handle empty segments', () => {
    const result = toVueRouter4(tree(['file//index.vue']))
    expect(result[0].path).toBe('/file')
  })
})

describe('toRegExp pattern matching', () => {
  it('should only match exact path patterns', () => {
    const [result] = toRegExp(tree(['[slug].vue']))
    expect('/file'.match(result.pattern)?.groups?.slug).toBe('file')
    expect('/test/thing'.match(result.pattern)).toBeFalsy()
    expect('file'.match(result.pattern)).toBeFalsy()
    expect(''.match(result.pattern)).toBeFalsy()
  })

  it('should properly match nested dynamic routes', () => {
    const [result] = toRegExp(tree(['users/[id]/posts/[slug].vue']))
    expect('/users/abc/posts/world'.match(result.pattern)?.groups).toEqual({ id: 'abc', slug: 'world' })
    expect('/users/123'.match(result.pattern)).toBeFalsy()
    expect('/users/123/posts/hello/extra'.match(result.pattern)).toBeFalsy()
  })

  it('should handle optional parameters correctly', () => {
    const [result] = toRegExp(tree(['products/[[category]].vue']))
    expect('/products/electronics'.match(result.pattern)?.groups?.category).toBe('electronics')
    expect('/products'.match(result.pattern)).toBeTruthy()
    expect('/products/electronics/phones'.match(result.pattern)).toBeFalsy()
  })

  it('should handle catchall routes correctly', () => {
    const [result] = toRegExp(tree(['docs/[...slug].vue']))
    expect('/docs/guide/getting-started'.match(result.pattern)?.groups?.slug).toBe('guide/getting-started')
    expect('/docs'.match(result.pattern)).toBeTruthy()
    expect('/guide/getting-started'.match(result.pattern)).toBeFalsy()
  })

  it('should handle repeatable parameters correctly', () => {
    const [result] = toRegExp(tree(['posts/[slug]+.vue']))
    expect('/posts/hello/world/test'.match(result.pattern)?.groups?.slug).toBe('hello/world/test')
    expect('/posts'.match(result.pattern)).toBeFalsy()
  })

  it('should handle optional repeatable parameters correctly', () => {
    const [result] = toRegExp(tree(['articles/[[slug]]+.vue']))
    expect('/articles/hello/world'.match(result.pattern)?.groups?.slug).toBe('hello/world')
    expect('/articles'.match(result.pattern)).toBeTruthy()
  })

  it('should handle group-only segments', () => {
    const result = toRegExp(tree(['(group).vue']))
    expect(result[0].pattern.toString()).toBe('/^\\/?$/')
    expect(result[0].keys).toEqual([])
  })

  it('should sanitize capture group names', () => {
    expect(toRegExp(tree(['[1param].vue']))[0].keys).toEqual(['_1param'])
    expect(toRegExp(tree(['[param.name].vue']))[0].keys).toEqual(['paramname'])
  })

  it('should handle optional segments correctly', () => {
    const result = toRegExp(tree(['optional/[[param]]/more.vue']))
    expect(result[0].pattern.toString()).toBe('/^\\/optional(?:\\/(?<param>[^/]*))?\\/more\\/?$/')
  })

  it('should handle static tokens with colons', () => {
    expect(toVueRouter4(tree(['file:with:colons.vue']))[0].path).toBe('/file\\:with\\:colons')
  })

  it('should handle mixed static and dynamic tokens', () => {
    expect(toVueRouter4(tree(['static-[dynamic]-static.vue']))[0].path).toBe('/static-:dynamic()-static')
  })
})

describe('tree utilities', () => {
  it('walkTree visits all nodes', () => {
    const t = tree(['about.vue', 'about/team.vue'])
    const visited: string[] = []
    walkTree(t, node => visited.push(node.rawSegment))
    expect(visited).toContain('about')
    expect(visited).toContain('team')
  })

  it('isPageNode distinguishes page vs structural nodes', () => {
    const t = tree(['parent/child.vue'])
    expect(isPageNode(t.root)).toBe(false)
    const parentNode = t.root.children.get('parent')!
    expect(isPageNode(parentNode)).toBe(false)
    const childNode = parentNode.children.get('child')!
    expect(isPageNode(childNode)).toBe(true)
  })
})

describe('buildTree duplicate strategies', () => {
  it('first-wins keeps the first file (default)', () => {
    const t = buildTree(['about.vue', 'about.vue'])
    const node = t.root.children.get('about')!
    expect(node.files).toHaveLength(1)
    expect(node.files[0].path).toBe('about.vue')
  })

  it('last-wins replaces with the second file', () => {
    const t = buildTree(['a.vue', 'a.vue'], { duplicateStrategy: 'last-wins' })
    expect(t.root.children.get('a')!.files).toHaveLength(1)
  })

  it('error throws on duplicates', () => {
    expect(() => buildTree(['a.vue', 'a.vue'], { duplicateStrategy: 'error' })).toThrow('Duplicate route file')
  })

  it('allows same path with different modes', () => {
    const t = buildTree(parsePath(['a.client.vue', 'a.server.vue'], { modes: ['client', 'server'] }))
    const node = t.root.children.get('a')!
    expect(node.files).toHaveLength(2)
    expect(node.files[0].modes).toEqual(['client'])
    expect(node.files[1].modes).toEqual(['server'])
  })

  it('allows same path with different named views', () => {
    const t = buildTree(parsePath(['index.vue', 'index@sidebar.vue']))
    // index.vue → default view on root child '', index@sidebar.vue → sidebar view on same node
    const indexNode = t.root.children.get('')!
    expect(indexNode.files).toHaveLength(2)
    expect(indexNode.files[0].viewName).toBe('default')
    expect(indexNode.files[1].viewName).toBe('sidebar')
  })

  it('accepts pre-parsed paths', () => {
    const parsed = parsePath(['about.vue', 'contact.vue'])
    const t = buildTree(parsed)
    expect(t.root.children.has('about')).toBe(true)
    expect(t.root.children.has('contact')).toBe(true)
  })
})
