import { addRoute, createRouter, findRoute } from 'rou3'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { addFile, buildTree, compileParsePath, isPageNode, parsePath, parseSegment, removeFile, toRegExp, toRou3, toVueRouter4, toVueRouterPath, toVueRouterSegment, walkTree } from '../../src'

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

  it('should skip group tokens in mixed segments', () => {
    expect(toRou3(tree(['(group)[slug].vue']))[0].path).toEqual('/:slug')
  })

  it('should use wildcard for dynamic tokens without a name', () => {
    const t = buildTree([{
      file: 'unnamed.vue',
      segments: [[{ type: 'dynamic', value: '' }]],
    }] as any)
    expect(toRou3(t)[0].path).toEqual('/*')
  })

  it('should use double wildcard for catchall tokens without a name', () => {
    const t = buildTree([{
      file: 'unnamed.vue',
      segments: [[{ type: 'catchall', value: '' }]],
    }] as any)
    expect(toRou3(t)[0].path).toEqual('/**')
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
      const { name, path: routePath, children } = toVueRouter4(tree([path]))[0]
      const router = createVueRouter({
        history: createMemoryHistory(),
        routes: [{
          name,
          path: routePath,
          children: children as any,
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

  it('should skip group tokens in mixed segments', () => {
    const [result] = toRegExp(tree(['(group)[slug].vue']))
    expect('/test'.match(result.pattern)?.groups?.slug).toBe('test')
    expect(result.keys).toEqual(['slug'])
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

  it('handles unknown token types in segment keys gracefully', () => {
    // Exercises the default branch in tokenToString (tree.ts)
    const syntheticParsed = [{
      file: 'custom.vue',
      segments: [[{ type: 'unknown' as any, value: 'custom' }]],
    }]
    const t = buildTree(syntheticParsed as any)
    expect(t.root.children.has('custom')).toBe(true)
  })
})

describe('pluggable route name generation', () => {
  it('uses default Nuxt-style names', () => {
    const routes = toVueRouter4(tree(['users/[id]/posts.vue']))
    expect(routes[0].name).toBe('users-id-posts')
  })

  it('accepts custom getRouteName', () => {
    const routes = toVueRouter4(tree(['users/[id]/posts.vue']), {
      getRouteName: raw => raw.replace(/\//g, '.'),
    })
    expect(routes[0].name).toBe('users.id.posts')
  })

  it('custom name generator receives raw slash-separated name', () => {
    const received: string[] = []
    toVueRouter4(tree(['a.vue', 'b/c.vue']), {
      getRouteName: (raw) => {
        received.push(raw)
        return raw
      },
    })
    expect(received).toContain('a')
    expect(received).toContain('b/c')
  })

  it('calls onDuplicateRouteName when routes have the same name', () => {
    const duplicates: Array<{ name: string, file: string, existingFile: string }> = []
    // parent/[child].vue and parent-[child].vue both produce name 'parent-child'
    toVueRouter4(tree(['parent/[child].vue', 'parent-[child].vue']), {
      onDuplicateRouteName: (name, file, existingFile) => {
        duplicates.push({ name, file, existingFile })
      },
    })
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].name).toBe('parent-child')
  })

  it('does not call onDuplicateRouteName when names are unique', () => {
    const duplicates: string[] = []
    toVueRouter4(tree(['about.vue', 'contact.vue']), {
      onDuplicateRouteName: name => duplicates.push(name),
    })
    expect(duplicates).toHaveLength(0)
  })
})

describe('route ordering / priority', () => {
  it('orders static before dynamic within siblings', () => {
    const routes = toVueRouter4(tree([
      '[slug].vue',
      'about.vue',
      'index.vue',
    ]))
    const paths = routes.map(r => r.path)
    const staticIdx = paths.indexOf('/about')
    const dynamicIdx = paths.indexOf('/:slug()')
    expect(staticIdx).toBeLessThan(dynamicIdx)
  })

  it('orders dynamic before optional', () => {
    const routes = toVueRouter4(tree([
      '[[opt]].vue',
      '[req].vue',
    ]))
    const paths = routes.map(r => r.path)
    expect(paths.indexOf('/:req()')).toBeLessThan(paths.indexOf('/:opt?'))
  })

  it('orders dynamic before catchall', () => {
    const routes = toVueRouter4(tree([
      '[...catch].vue',
      '[slug].vue',
      'static.vue',
    ]))
    const paths = routes.map(r => r.path)
    const staticIdx = paths.indexOf('/static')
    const dynamicIdx = paths.indexOf('/:slug()')
    const catchIdx = paths.indexOf('/:catch(.*)*')
    expect(staticIdx).toBeLessThan(dynamicIdx)
    expect(dynamicIdx).toBeLessThan(catchIdx)
  })

  it('orders children by priority too', () => {
    const routes = toVueRouter4(tree([
      'parent.vue',
      'parent/[...catch].vue',
      'parent/[id].vue',
      'parent/settings.vue',
    ]))
    const children = routes[0].children
    const paths = children.map(r => r.path)
    const staticIdx = paths.indexOf('settings')
    const dynamicIdx = paths.indexOf(':id()')
    const catchIdx = paths.indexOf(':catch(.*)*')
    expect(staticIdx).toBeLessThan(dynamicIdx)
    expect(dynamicIdx).toBeLessThan(catchIdx)
  })
})

describe('mode-aware emission', () => {
  it('emits modes when files have mode variants', () => {
    const t = buildTree(['page.client.vue', 'page.server.vue'], { modes: ['client', 'server'] })
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].modes).toBeDefined()
    expect(routes[0].modes).toContain('client')
    expect(routes[0].modes).toContain('server')
  })

  it('does not emit modes when no mode files exist', () => {
    const routes = toVueRouter4(tree(['about.vue']))
    expect(routes[0].modes).toBeUndefined()
  })
})

describe('named view emission', () => {
  it('emits components when named views exist', () => {
    const t = buildTree(parsePath(['index.vue', 'index@sidebar.vue']))
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].file).toBe('index.vue')
    expect(routes[0].components).toEqual({
      default: 'index.vue',
      sidebar: 'index@sidebar.vue',
    })
  })

  it('does not emit components for single-view routes', () => {
    const routes = toVueRouter4(tree(['about.vue']))
    expect(routes[0].components).toBeUndefined()
  })

  it('handles nested named views', () => {
    const t = buildTree(parsePath(['users/[id].vue', 'users/[id]@aside.vue']))
    const routes = toVueRouter4(t)
    // Should be a flat route for users/[id] since there's no users.vue parent
    const route = routes.find(r => r.path.includes(':id'))
    expect(route).toBeDefined()
    expect(route!.components).toEqual({
      default: 'users/[id].vue',
      aside: 'users/[id]@aside.vue',
    })
  })
})

describe('layer priority', () => {
  it('higher priority file wins on collision (lower number = higher priority)', () => {
    const t = buildTree([
      { path: 'layer/pages/about.vue', priority: 1 },
      { path: 'pages/about.vue', priority: 0 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    // app layer (priority 0) should win over extending layer (priority 1)
    expect(routes[0].file).toBe('pages/about.vue')
  })

  it('lower priority file does not override higher priority', () => {
    const t = buildTree([
      { path: 'pages/about.vue', priority: 0 },
      { path: 'layer/pages/about.vue', priority: 1 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].file).toBe('pages/about.vue')
  })

  it('files at different tree positions are not affected by priority', () => {
    const t = buildTree([
      { path: 'pages/about.vue', priority: 0 },
      { path: 'layer/pages/contact.vue', priority: 1 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(2)
  })

  it('layer can add children to a parent from another layer', () => {
    const t = buildTree([
      { path: 'pages/dashboard.vue', priority: 0 },
      { path: 'pages/dashboard/settings.vue', priority: 0 },
      { path: 'layer/pages/dashboard/analytics.vue', priority: 1 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].file).toBe('pages/dashboard.vue')
    expect(routes[0].children).toHaveLength(2)
    const childFiles = routes[0].children.map(c => c.file)
    expect(childFiles).toContain('pages/dashboard/settings.vue')
    expect(childFiles).toContain('layer/pages/dashboard/analytics.vue')
  })

  it('priority override works regardless of insertion order', () => {
    // Layer file inserted first but has lower priority (higher number)
    const t1 = buildTree([
      { path: 'layer/pages/index.vue', priority: 1 },
      { path: 'pages/index.vue', priority: 0 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const r1 = toVueRouter4(t1)
    expect(r1[0].file).toBe('pages/index.vue')

    // App file inserted first — should still win
    const t2 = buildTree([
      { path: 'pages/index.vue', priority: 0 },
      { path: 'layer/pages/index.vue', priority: 1 },
    ], { roots: ['pages/', 'layer/pages/'] })
    const r2 = toVueRouter4(t2)
    expect(r2[0].file).toBe('pages/index.vue')
  })

  it('defaults to priority 0 for string inputs', () => {
    const t = buildTree(['about.vue', 'about.vue'])
    // First-wins with equal priority
    const node = t.root.children.get('about')!
    expect(node.files).toHaveLength(1)
    expect(node.files[0].priority).toBe(0)
  })

  it('defaults to priority 0 for InputFile without priority field', () => {
    const t = buildTree([
      { path: 'about.vue' },
    ])
    const node = t.root.children.get('about')!
    expect(node.files).toHaveLength(1)
    expect(node.files[0].priority).toBe(0)
  })
})

describe('incremental addFile', () => {
  it('adds a file to an existing tree', () => {
    const t = buildTree(['about.vue'])
    addFile(t, 'contact.vue')
    expect(t.root.children.has('contact')).toBe(true)
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(2)
  })

  it('produces the same result as building from scratch', () => {
    const full = buildTree(['about.vue', 'users/[id].vue', 'index.vue'])
    const incremental = buildTree(['about.vue', 'index.vue'])
    addFile(incremental, 'users/[id].vue')

    const fullRoutes = toVueRouter4(full)
    const incRoutes = toVueRouter4(incremental)
    expect(incRoutes).toEqual(fullRoutes)
  })

  it('supports InputFile with priority', () => {
    const t = buildTree([
      { path: 'pages/about.vue', priority: 0 },
    ], { roots: ['pages/'] })
    addFile(t, { path: 'layer/pages/about.vue', priority: 1 }, { roots: ['pages/', 'layer/pages/'] })
    // Priority 0 file should still win
    const aboutNode = t.root.children.get('about')!
    expect(aboutNode.files).toHaveLength(1)
    expect(aboutNode.files[0].path).toBe('pages/about.vue')
  })

  it('supports InputFile without priority (defaults to 0)', () => {
    const t = buildTree(['about.vue'])
    addFile(t, { path: 'contact.vue' })
    const contactNode = t.root.children.get('contact')!
    expect(contactNode.files).toHaveLength(1)
    expect(contactNode.files[0].priority).toBe(0)
  })

  it('adds nested files correctly', () => {
    const t = buildTree(['parent.vue'])
    addFile(t, 'parent/child.vue')
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].children).toHaveLength(1)
    expect(routes[0].children[0].file).toBe('parent/child.vue')
  })

  it('handles adding to an empty tree', () => {
    const t = buildTree([])
    addFile(t, 'index.vue')
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].path).toBe('/')
  })
})

describe('incremental removeFile', () => {
  it('removes a file from the tree', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    const removed = removeFile(t, 'about.vue')
    expect(removed).toBe(true)
    expect(t.root.children.has('about')).toBe(false)
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(1)
    expect(routes[0].file).toBe('contact.vue')
  })

  it('returns false when file not found', () => {
    const t = buildTree(['about.vue'])
    expect(removeFile(t, 'nonexistent.vue')).toBe(false)
  })

  it('prunes empty structural nodes', () => {
    const t = buildTree(['users/[id]/profile.vue'])
    removeFile(t, 'users/[id]/profile.vue')
    // The entire users/[id] chain should be pruned
    expect(t.root.children.size).toBe(0)
  })

  it('does not prune nodes that still have other files', () => {
    const t = buildTree(['users/[id].vue', 'users/index.vue'])
    removeFile(t, 'users/[id].vue')
    // users/ node should remain because index.vue is still there
    expect(t.root.children.has('users')).toBe(true)
  })

  it('does not prune nodes that still have children', () => {
    const t = buildTree(['users/[id].vue', 'users/[id]/posts.vue'])
    removeFile(t, 'users/[id].vue')
    // [id] node should remain because it has children
    const usersNode = t.root.children.get('users')!
    expect(usersNode.children.has('[id]')).toBe(true)
  })

  it('add then remove restores the original tree output', () => {
    const t = buildTree(['about.vue', 'index.vue'])
    const originalRoutes = toVueRouter4(t)

    addFile(t, 'contact.vue')
    expect(toVueRouter4(t)).toHaveLength(3)

    removeFile(t, 'contact.vue')
    expect(toVueRouter4(t)).toEqual(originalRoutes)
  })

  it('removes deeply nested files', () => {
    const t = buildTree(['a/b/c/d.vue', 'a/b/other.vue'])
    removeFile(t, 'a/b/c/d.vue')
    // c/ and d should be pruned, but a/b/ should remain (with "other" child)
    const aNode = t.root.children.get('a')!
    const bNode = aNode.children.get('b')!
    expect(bNode.children.has('c')).toBe(false)
    expect(bNode.children.has('other')).toBe(true)
  })
})

describe('toVueRouterSegment', () => {
  it('converts static tokens', () => {
    expect(toVueRouterSegment(parseSegment('about'))).toBe('about')
  })

  it('converts dynamic tokens', () => {
    expect(toVueRouterSegment(parseSegment('[id]'))).toBe(':id()')
  })

  it('converts optional tokens', () => {
    expect(toVueRouterSegment(parseSegment('[[opt]]'))).toBe(':opt?')
  })

  it('converts catchall tokens (terminal by default)', () => {
    expect(toVueRouterSegment(parseSegment('[...slug]'))).toBe(':slug(.*)*')
  })

  it('converts catchall tokens with hasSucceeding: true', () => {
    expect(toVueRouterSegment(parseSegment('[...slug]'), { hasSucceeding: true })).toBe(':slug([^/]*)*')
  })

  it('converts catchall tokens with hasSucceeding: false', () => {
    expect(toVueRouterSegment(parseSegment('[...slug]'), { hasSucceeding: false })).toBe(':slug(.*)*')
  })

  it('converts repeatable tokens', () => {
    expect(toVueRouterSegment(parseSegment('[slug]+'))).toBe(':slug+')
  })

  it('converts optional-repeatable tokens', () => {
    expect(toVueRouterSegment(parseSegment('[[slug]]+'))).toBe(':slug*')
  })

  it('skips group tokens', () => {
    expect(toVueRouterSegment(parseSegment('(group)'))).toBe('')
  })

  it('handles mixed tokens', () => {
    expect(toVueRouterSegment(parseSegment('prefix-[slug]-suffix'))).toBe('prefix-:slug()-suffix')
  })

  it('escapes colons in static tokens', () => {
    expect(toVueRouterSegment(parseSegment('file:name'))).toBe('file\\:name')
  })

  it('handles the i18n use case from the feature request', () => {
    const tokens = parseSegment('[foo]_[bar]:[...buz]_buz_[[qux]]')
    expect(toVueRouterSegment(tokens)).toBe(':foo()_:bar()\\::buz(.*)*_buz_:qux?')
  })

  it('handles multiple dynamic tokens', () => {
    expect(toVueRouterSegment(parseSegment('[a]_[b]'))).toBe(':a()_:b()')
  })

  it('returns empty string for index segment', () => {
    // parseSegment('index') normalizes to [{ type: 'static', value: '' }]
    expect(toVueRouterSegment(parseSegment('index'))).toBe('')
  })
})

describe('toVueRouterPath', () => {
  it('converts single-segment paths', () => {
    const parsed = parsePath(['about.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/about')
  })

  it('converts multi-segment paths', () => {
    const parsed = parsePath(['users/[id]/posts.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/users/:id()/posts')
  })

  it('returns / for index-only paths', () => {
    const parsed = parsePath(['index.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/')
  })

  it('auto-detects mid-path catchall (hasSucceeding)', () => {
    const parsed = parsePath(['[...slug]/suffix.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/:slug([^/]*)*/suffix')
  })

  it('uses terminal catchall at end of path', () => {
    const parsed = parsePath(['prefix/[...slug].vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/prefix/:slug(.*)*')
  })

  it('skips group-only segments', () => {
    const parsed = parsePath(['(group)/about.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/about')
  })

  it('handles optional parameters', () => {
    const parsed = parsePath(['users/[[id]].vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/users/:id?')
  })

  it('handles repeatable parameters', () => {
    const parsed = parsePath(['articles/[slug]+.vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/articles/:slug+')
  })

  it('handles complex nested paths with mixed types', () => {
    const parsed = parsePath(['[[lang]]/users/[id]/[[tab]].vue'])[0]
    expect(toVueRouterPath(parsed.segments)).toBe('/:lang?/users/:id()/:tab?')
  })

  it('produces paths consistent with toVueRouter4', () => {
    const testCases = [
      'about.vue',
      '[slug].vue',
      '[[opt]].vue',
      '[...catch].vue',
      'users/[id].vue',
      'prefix/[...slug]/suffix.vue',
      '[slug]+.vue',
      '[[slug]]+.vue',
    ]

    for (const filePath of testCases) {
      const vueRoute = toVueRouter4(tree([filePath]))[0]
      const parsed = parsePath([filePath])[0]
      const segmentPath = toVueRouterPath(parsed.segments)
      expect(segmentPath, `mismatch for ${filePath}`).toBe(vueRoute.path)
    }
  })
})

describe('toVueRouter4 caching', () => {
  it('returns equivalent output on repeated calls without mutation', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    const first = toVueRouter4(t)
    const second = toVueRouter4(t)
    expect(second).toEqual(first)
  })

  it('returns a new array reference each time (safe for mutation)', () => {
    const t = buildTree(['about.vue'])
    const first = toVueRouter4(t)
    const second = toVueRouter4(t)
    expect(first).not.toBe(second)
  })

  it('returned routes can be mutated without affecting subsequent calls', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    const first = toVueRouter4(t)
    first.push({ path: '/injected', file: 'injected.vue', children: [] })
    first[0].name = 'mutated'

    const second = toVueRouter4(t)
    expect(second).toHaveLength(2)
    expect(second[0].name).toBe('about')
  })

  it('invalidates cache when addFile is called', () => {
    const t = buildTree(['about.vue'])
    const first = toVueRouter4(t)
    expect(first).toHaveLength(1)

    addFile(t, 'contact.vue')
    const second = toVueRouter4(t)
    expect(second).toHaveLength(2)
  })

  it('invalidates cache when removeFile is called', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    const first = toVueRouter4(t)
    expect(first).toHaveLength(2)

    removeFile(t, 'about.vue')
    const second = toVueRouter4(t)
    expect(second).toHaveLength(1)
    expect(second[0].file).toBe('contact.vue')
  })

  it('invalidates cache when options change', () => {
    const t = buildTree(['about.vue'])
    const first = toVueRouter4(t)
    expect(first[0].name).toBe('about')

    const second = toVueRouter4(t, { getRouteName: raw => raw.toUpperCase() })
    expect(second[0].name).toBe('ABOUT')
  })

  it('clones children deeply', () => {
    const t = buildTree(['parent.vue', 'parent/child.vue'])
    const first = toVueRouter4(t)
    const second = toVueRouter4(t)
    expect(first[0].children).not.toBe(second[0].children)
    expect(first[0].children[0]).not.toBe(second[0].children[0])
    expect(first[0].children).toEqual(second[0].children)
  })

  it('clones meta and components', () => {
    const t = buildTree(parsePath(['(group)/about.vue', 'index.vue', 'index@sidebar.vue']))
    const first = toVueRouter4(t)
    const second = toVueRouter4(t)

    const groupRoute = first.find(r => r.meta?.groups)!
    const sidebarRoute = first.find(r => r.components)!

    expect(groupRoute.meta).not.toBe(second.find(r => r.meta?.groups)!.meta)
    expect(sidebarRoute.components).not.toBe(second.find(r => r.components)!.components)
  })

  it('clones modes array', () => {
    const t = buildTree(['page.client.vue'], { modes: ['client', 'server'] })
    const first = toVueRouter4(t)
    const second = toVueRouter4(t)
    expect(first[0].modes).not.toBe(second[0].modes)
    expect(first[0].modes).toEqual(second[0].modes)
  })

  it('clones route with meta but no groups (defensive)', () => {
    const t = buildTree(parsePath(['(group)/about.vue']))
    // First call: populate cache with default options (key = '')
    const first = toVueRouter4(t)
    expect(first[0].meta?.groups).toEqual(['group'])

    // Mutate the cached template to remove groups from meta
    // This exercises the clone path where meta exists but has no groups
    const cached = (t as any)['~cachedVueRouter']
    cached.routes[0].meta = { customKey: 'value' }

    // Second call with same options — should use cache and clone
    const cloned = toVueRouter4(t)
    expect(cloned[0].meta).toEqual({ customKey: 'value' })
    expect(cloned[0].meta!.groups).toBeUndefined()
  })
})

describe('attrs option', () => {
  it('collapses single mode into an attr', () => {
    const t = buildTree(['page.server.vue'], { modes: ['client', 'server'] })
    const routes = toVueRouter4(t, { attrs: { mode: ['client', 'server'] } })
    expect(routes[0].mode).toBe('server')
    expect(routes[0].modes).toBeUndefined()
  })

  it('collapses single client mode into an attr', () => {
    const t = buildTree(['page.client.vue'], { modes: ['client', 'server'] })
    const routes = toVueRouter4(t, { attrs: { mode: ['client', 'server'] } })
    expect(routes[0].mode).toBe('client')
    expect(routes[0].modes).toBeUndefined()
  })

  it('omits attr and emits modes when multiple modes match', () => {
    const t = buildTree(['page.client.vue', 'page.server.vue'], { modes: ['client', 'server'] })
    const routes = toVueRouter4(t, { attrs: { mode: ['client', 'server'] } })
    expect(routes[0].mode).toBeUndefined()
    expect(routes[0].modes).toEqual(['client', 'server'])
  })

  it('does not add attr when no modes match', () => {
    const t = buildTree(['about.vue'])
    const routes = toVueRouter4(t, { attrs: { mode: ['client', 'server'] } })
    expect(routes[0].mode).toBeUndefined()
    expect(routes[0].modes).toBeUndefined()
  })

  it('supports custom attr names', () => {
    const t = buildTree(['api.get.vue'], { modes: ['get', 'post'] })
    const routes = toVueRouter4(t, { attrs: { method: ['get', 'post'] } })
    expect(routes[0].method).toBe('get')
    expect(routes[0].modes).toBeUndefined()
  })

  it('supports multiple attr definitions', () => {
    const t = buildTree(['page.client.vue'], { modes: ['client', 'server', 'dark', 'light'] })
    const routes = toVueRouter4(t, {
      attrs: {
        mode: ['client', 'server'],
        theme: ['dark', 'light'],
      },
    })
    expect(routes[0].mode).toBe('client')
    expect(routes[0].theme).toBeUndefined()
    expect(routes[0].modes).toBeUndefined()
  })

  it('preserves modes when no attr values match', () => {
    const t = buildTree(['page.vapor.vue'], { modes: ['vapor', 'client'] })
    const routes = toVueRouter4(t, { attrs: { method: ['get', 'post'] } })
    // vapor doesn't match any method attr value
    expect(routes[0].method).toBeUndefined()
    expect(routes[0].modes).toEqual(['vapor'])
  })

  it('attrs are cloned on cached return', () => {
    const t = buildTree(['page.server.vue'], { modes: ['client', 'server'] })
    const opts = { attrs: { mode: ['client', 'server'] } }
    const first = toVueRouter4(t, opts)
    const second = toVueRouter4(t, opts)
    expect(first[0].mode).toBe('server')
    expect(second[0].mode).toBe('server')
    expect(first[0]).not.toBe(second[0])
  })

  it('infers typed attrs from options', () => {
    const t = buildTree(['page.server.vue'], { modes: ['client', 'server'] })
    const routes = toVueRouter4(t, { attrs: { mode: ['client', 'server'] } })

    // Type-level: mode is typed as 'client' | 'server' | undefined
    const mode = routes[0].mode
    expect(mode).toBe('server')

    // Verify the type is narrow (not `unknown`)
    if (typeof mode === 'string') {
      // mode is 'client' | 'server' here
      expect(['client', 'server']).toContain(mode)
    }
  })

  it('infers typed attrs for multiple attr definitions', () => {
    const t = buildTree(['page.client.vue'], { modes: ['client', 'server', 'get', 'post'] })
    const routes = toVueRouter4(t, {
      attrs: {
        mode: ['client', 'server'],
        method: ['get', 'post'],
      },
    })
    // Both mode and method should be typed properties
    const _mode: 'client' | 'server' | undefined = routes[0].mode
    const _method: 'get' | 'post' | undefined = routes[0].method
    expect(_mode).toBe('client')
    expect(_method).toBeUndefined()
  })

  it('preserves index signature when no attrs option given', () => {
    const t = buildTree(['page.vue'])
    const routes = toVueRouter4(t)
    // Without attrs, routes should still have index signature for backward compat
    const _val: unknown = routes[0].anyProperty
    expect(_val).toBeUndefined()
  })
})

describe('compileParsePath', () => {
  it('produces the same result as parsePath', () => {
    const options = { roots: ['pages/'], modes: ['client', 'server'] }
    const paths = ['pages/index.vue', 'pages/about.client.vue', 'pages/[slug].vue']
    const compiled = compileParsePath(options)
    expect(compiled(paths)).toEqual(parsePath(paths, options))
  })

  it('works with addFile', () => {
    const compiled = compileParsePath({ roots: ['pages/'] })
    const t = buildTree([{ path: 'pages/about.vue' }], { roots: ['pages/'] })
    addFile(t, { path: 'pages/contact.vue' }, compiled)
    const routes = toVueRouter4(t)
    expect(routes).toHaveLength(2)
  })

  it('has ~compiled marker', () => {
    const compiled = compileParsePath()
    expect(compiled['~compiled']).toBe(true)
  })
})

describe('compileParsePath edge cases', () => {
  it('compiles with custom extensions', () => {
    const compiled = compileParsePath({ extensions: ['.vue', '.tsx'] })
    const result = compiled(['about.vue', 'contact.tsx'])
    expect(result).toHaveLength(2)
    expect(result[0].segments[0][0]).toEqual({ type: 'static', value: 'about' })
    expect(result[1].segments[0][0]).toEqual({ type: 'static', value: 'contact' })
  })

  it('compiles with warn function', () => {
    const warnings: string[] = []
    const compiled = compileParsePath({ warn: msg => warnings.push(msg) })
    compiled(['[param#invalid].vue'])
    expect(warnings).toHaveLength(1)
  })

  it('compiles with modes', () => {
    const compiled = compileParsePath({ modes: ['client', 'server'] })
    const result = compiled(['app.client.vue'])
    expect(result[0].meta?.modes).toEqual(['client'])
  })

  it('compiles with multiple roots (exercises sort callback)', () => {
    const compiled = compileParsePath({ roots: ['pages/', 'layer/pages/'] })
    const result = compiled(['pages/about.vue', 'layer/pages/contact.vue'])
    expect(result).toHaveLength(2)
    expect(result[0].segments[0][0]).toEqual({ type: 'static', value: 'about' })
    expect(result[1].segments[0][0]).toEqual({ type: 'static', value: 'contact' })
  })
})

describe('file index for removeFile', () => {
  it('uses file index for O(1) removal', () => {
    const t = buildTree(['a/b/c/deep.vue', 'other.vue'])
    expect(t['~fileIndex'].size).toBe(2)
    expect(t['~fileIndex'].has('a/b/c/deep.vue')).toBe(true)
    expect(t['~fileIndex'].has('other.vue')).toBe(true)

    removeFile(t, 'a/b/c/deep.vue')
    expect(t['~fileIndex'].has('a/b/c/deep.vue')).toBe(false)
    expect(t['~fileIndex'].has('other.vue')).toBe(true)
  })

  it('updates file index on addFile', () => {
    const t = buildTree(['about.vue'])
    expect(t['~fileIndex'].size).toBe(1)

    addFile(t, 'contact.vue')
    expect(t['~fileIndex'].size).toBe(2)
    expect(t['~fileIndex'].has('contact.vue')).toBe(true)
  })

  it('file index tracks layer priority overrides', () => {
    const t = buildTree([
      { path: 'layer/pages/about.vue', priority: 1 },
      { path: 'pages/about.vue', priority: 0 },
    ], { roots: ['pages/', 'layer/pages/'] })
    // Only the winning file should be in the index
    expect(t['~fileIndex'].has('pages/about.vue')).toBe(true)
    expect(t['~fileIndex'].has('layer/pages/about.vue')).toBe(false)
  })
})

describe('removeFile dfs fallback', () => {
  it('falls back to dfs when file is not in index', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    // Manually remove from index to simulate missing entry
    t['~fileIndex'].delete('about.vue')
    const removed = removeFile(t, 'about.vue')
    expect(removed).toBe(true)
    expect(t.root.children.has('about')).toBe(false)
    expect(t['~dirty']).toBe(true)
  })

  it('dfs fallback returns false when file not found', () => {
    const t = buildTree(['about.vue'])
    t['~fileIndex'].clear()
    const removed = removeFile(t, 'nonexistent.vue')
    expect(removed).toBe(false)
  })

  it('handles stale file index entry (node no longer has the file)', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    // Corrupt: index points to node but node's files were cleared
    const node = t['~fileIndex'].get('about.vue')!
    node.files = []
    // removeFile should fall through index fast-path and try dfs fallback
    const removed = removeFile(t, 'about.vue')
    expect(removed).toBe(false)
  })
})

describe('dirty flag', () => {
  it('tree starts dirty after buildTree', () => {
    const t = buildTree(['about.vue'])
    expect(t['~dirty']).toBe(true)
  })

  it('toVueRouter4 clears dirty flag', () => {
    const t = buildTree(['about.vue'])
    toVueRouter4(t)
    expect(t['~dirty']).toBe(false)
  })

  it('addFile sets dirty flag', () => {
    const t = buildTree(['about.vue'])
    toVueRouter4(t)
    expect(t['~dirty']).toBe(false)
    addFile(t, 'contact.vue')
    expect(t['~dirty']).toBe(true)
  })

  it('removeFile sets dirty flag', () => {
    const t = buildTree(['about.vue', 'contact.vue'])
    toVueRouter4(t)
    expect(t['~dirty']).toBe(false)
    removeFile(t, 'about.vue')
    expect(t['~dirty']).toBe(true)
  })

  it('removeFile does not set dirty when file not found', () => {
    const t = buildTree(['about.vue'])
    toVueRouter4(t)
    expect(t['~dirty']).toBe(false)
    removeFile(t, 'nonexistent.vue')
    expect(t['~dirty']).toBe(false)
  })
})
