import { describe, expect, it } from 'vitest'
import { parsePath, parseSegment } from '../../src/parse'

describe('parsing vue file paths', () => {
  const paths = [
    'file.vue',
    'test.html.vue',
    '[slug].vue',
    '[...slug].vue',
    '[[foo]]/index.vue',
    '[[sub]]/route-[slug].vue',
    'optional/[[opt]].vue',
    'optional/prefix-[[opt]].vue',
    'optional/[[opt]]-postfix.vue',
    'optional/prefix-[[opt]]-postfix.vue',
    '[a1_1a].vue',
    '[b2.2b].vue',
    '[b2]_[2b].vue',
    '[[c3@3c]].vue',
    '[[d4-4d]].vue',
    'test:name.vue',
    '[slug]+.vue',
    '[[slug]]+.vue',
    'articles/[slug]+.vue',
    'index@sidebar.vue',
    'users/[id]@aside.vue',
  ]
  const errors = [
    '[slug.vue',
    '[].vue',
  ]

  it('throws errors when appropriate', () => {
    for (const path of errors) {
      let err
      try {
        parsePath([path])
      }
      catch (e) {
        err = e
      }
      expect(err).toBeDefined()
    }
  })

  it('should handle empty strings', () => {
    const [result] = parsePath([''])
    expect(result).toMatchInlineSnapshot(`
      {
        "file": "",
        "meta": undefined,
        "segments": [
          [
            {
              "type": "static",
              "value": "",
            },
          ],
        ],
      }
    `)
  })

  it('should handle group tokens in parsing', () => {
    const [pure, mixed] = parsePath(['(group).vue', '(group)[slug].vue'])
    expect(pure.segments[0]).toEqual([
      { type: 'group', value: 'group' },
    ])
    expect(mixed.segments).toEqual([[
      { type: 'group', value: 'group' },
      { type: 'dynamic', value: 'slug' },
    ]])
  })

  it('should handle mixed static and dynamic content', () => {
    const result = parsePath(['prefix-[slug]-suffix.vue'])
    expect(result[0].segments[0]).toEqual([
      { type: 'static', value: 'prefix-' },
      { type: 'dynamic', value: 'slug' },
      { type: 'static', value: '-suffix' },
    ])
  })

  it('should handle edge cases in token parsing', () => {
    // Test parsing with group followed by dynamic
    const result1 = parsePath(['(group)[slug].vue'])
    expect(result1[0].segments[0]).toEqual([
      { type: 'group', value: 'group' },
      { type: 'dynamic', value: 'slug' },
    ])

    // Test parsing with static content followed by group
    const result2 = parsePath(['static(group).vue'])
    expect(result2[0].segments[0]).toEqual([
      { type: 'static', value: 'static' },
      { type: 'group', value: 'group' },
    ])
  })

  it('should handle complex static content scenarios', () => {
    // Test different static content patterns that would exercise the static state
    const result1 = parsePath(['file.with.dots.vue'])
    expect(result1[0].segments[0]).toEqual([
      { type: 'static', value: 'file.with.dots' },
    ])

    // Test static content with underscores and hyphens
    const result2 = parsePath(['file-with_underscores.vue'])
    expect(result2[0].segments[0]).toEqual([
      { type: 'static', value: 'file-with_underscores' },
    ])

    // Test static content with numbers
    const result3 = parsePath(['file123with456numbers.vue'])
    expect(result3[0].segments[0]).toEqual([
      { type: 'static', value: 'file123with456numbers' },
    ])
  })

  it('should warn about invalid characters in dynamic parameters', () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)

    // Test invalid characters in dynamic parameters
    parsePath(['[param#invalid].vue'], { warn })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch('\'#\' is not allowed in a dynamic route parameter')
  })

  it('should handle parseSegment with warn function properly', () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)

    // Test with optional parameter and invalid character
    parsePath(['[[param&invalid]].vue'], { warn })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('is not allowed in a dynamic route parameter')
  })

  it('should handle parseSegment function directly', () => {
    // Test parseSegment with a simple segment
    const result1 = parseSegment('simple')
    expect(result1).toEqual([{ type: 'static', value: 'simple' }])

    // Test parseSegment with dynamic content
    const result2 = parseSegment('[param]')
    expect(result2).toEqual([{ type: 'dynamic', value: 'param' }])

    // Test parseSegment with empty segment
    const result3 = parseSegment('')
    expect(result3).toEqual([{ type: 'static', value: '' }])
    const result4 = parseSegment('index')
    expect(result4).toEqual([{ type: 'static', value: '' }])
  })

  it('works', () => {
    const result = Object.fromEntries(paths.map(path => [path, parsePath([path])[0]]))
    expect(result).toMatchInlineSnapshot(`
      {
        "[...slug].vue": {
          "file": "[...slug].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "catchall",
                "value": "slug",
              },
            ],
          ],
        },
        "[[c3@3c]].vue": {
          "file": "[[c3@3c]].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "optional",
                "value": "c33c",
              },
            ],
          ],
        },
        "[[d4-4d]].vue": {
          "file": "[[d4-4d]].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "optional",
                "value": "d44d",
              },
            ],
          ],
        },
        "[[foo]]/index.vue": {
          "file": "[[foo]]/index.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "optional",
                "value": "foo",
              },
            ],
            [
              {
                "type": "static",
                "value": "",
              },
            ],
          ],
        },
        "[[slug]]+.vue": {
          "file": "[[slug]]+.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "optional-repeatable",
                "value": "slug",
              },
            ],
          ],
        },
        "[[sub]]/route-[slug].vue": {
          "file": "[[sub]]/route-[slug].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "optional",
                "value": "sub",
              },
            ],
            [
              {
                "type": "static",
                "value": "route-",
              },
              {
                "type": "dynamic",
                "value": "slug",
              },
            ],
          ],
        },
        "[a1_1a].vue": {
          "file": "[a1_1a].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "dynamic",
                "value": "a1_1a",
              },
            ],
          ],
        },
        "[b2.2b].vue": {
          "file": "[b2.2b].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "dynamic",
                "value": "b2.2b",
              },
            ],
          ],
        },
        "[b2]_[2b].vue": {
          "file": "[b2]_[2b].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "dynamic",
                "value": "b2",
              },
              {
                "type": "static",
                "value": "_",
              },
              {
                "type": "dynamic",
                "value": "2b",
              },
            ],
          ],
        },
        "[slug]+.vue": {
          "file": "[slug]+.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "repeatable",
                "value": "slug",
              },
            ],
          ],
        },
        "[slug].vue": {
          "file": "[slug].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "dynamic",
                "value": "slug",
              },
            ],
          ],
        },
        "articles/[slug]+.vue": {
          "file": "articles/[slug]+.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "articles",
              },
            ],
            [
              {
                "type": "repeatable",
                "value": "slug",
              },
            ],
          ],
        },
        "file.vue": {
          "file": "file.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "file",
              },
            ],
          ],
        },
        "index@sidebar.vue": {
          "file": "index@sidebar.vue",
          "meta": {
            "name": "sidebar",
          },
          "segments": [
            [
              {
                "type": "static",
                "value": "",
              },
            ],
          ],
        },
        "optional/[[opt]]-postfix.vue": {
          "file": "optional/[[opt]]-postfix.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "optional",
              },
            ],
            [
              {
                "type": "optional",
                "value": "opt",
              },
              {
                "type": "static",
                "value": "-postfix",
              },
            ],
          ],
        },
        "optional/[[opt]].vue": {
          "file": "optional/[[opt]].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "optional",
              },
            ],
            [
              {
                "type": "optional",
                "value": "opt",
              },
            ],
          ],
        },
        "optional/prefix-[[opt]]-postfix.vue": {
          "file": "optional/prefix-[[opt]]-postfix.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "optional",
              },
            ],
            [
              {
                "type": "static",
                "value": "prefix-",
              },
              {
                "type": "optional",
                "value": "opt",
              },
              {
                "type": "static",
                "value": "-postfix",
              },
            ],
          ],
        },
        "optional/prefix-[[opt]].vue": {
          "file": "optional/prefix-[[opt]].vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "optional",
              },
            ],
            [
              {
                "type": "static",
                "value": "prefix-",
              },
              {
                "type": "optional",
                "value": "opt",
              },
            ],
          ],
        },
        "test.html.vue": {
          "file": "test.html.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "test.html",
              },
            ],
          ],
        },
        "test:name.vue": {
          "file": "test:name.vue",
          "meta": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "test:name",
              },
            ],
          ],
        },
        "users/[id]@aside.vue": {
          "file": "users/[id]@aside.vue",
          "meta": {
            "name": "aside",
          },
          "segments": [
            [
              {
                "type": "static",
                "value": "users",
              },
            ],
            [
              {
                "type": "dynamic",
                "value": "id",
              },
            ],
          ],
        },
      }
    `)
  })
})

describe('parseFile function', () => {
  it('detects server mode when configured', () => {
    const result = parsePath(['app.server.vue'], { modes: ['server', 'client'] })
    expect(result[0].meta?.modes).toEqual(['server'])
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects client mode when configured', () => {
    const result = parsePath(['app.client.vue'], { modes: ['server', 'client'] })
    expect(result[0].meta?.modes).toEqual(['client'])
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('has no modes for regular files', () => {
    const result = parsePath(['app.vue'])
    expect(result[0].meta?.modes).toBeUndefined()
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('ignores mode-like extensions without configuration', () => {
    const result = parsePath(['app.server.vue'])
    expect(result[0].meta?.modes).toBeUndefined()
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app.server' }]])
  })

  it('detects multiple modes in correct order', () => {
    const result = parsePath(['app.client.vapor.vue'], { modes: ['client', 'server', 'vapor'] })
    expect(result[0].meta?.modes).toEqual(['client', 'vapor'])
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects custom modes', () => {
    const result = parsePath(['app.mobile.vue'], { modes: ['mobile', 'desktop'] })
    expect(result[0].meta?.modes).toEqual(['mobile'])
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects multiple custom modes', () => {
    const result = parsePath(['admin.desktop.dark.vue'], { modes: ['mobile', 'desktop', 'dark', 'light'] })
    expect(result[0].meta?.modes).toEqual(['desktop', 'dark'])
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'admin' }]])
  })

  it('ignores unknown modes', () => {
    const result = parsePath(['app.unknown.vue'], { modes: ['client', 'server'] })
    expect(result[0].meta?.modes).toBeUndefined()
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app.unknown' }]])
  })

  it('works with empty modes array', () => {
    const result = parsePath(['app.client.vue'], { modes: [] })
    expect(result[0].meta?.modes).toBeUndefined()
    expect(result[0].segments).toEqual([[{ type: 'static', value: 'app.client' }]])
  })
})

describe('group segments', () => {
  it('parses group segments', () => {
    const result = parseSegment('(group)')
    expect(result).toEqual([{ type: 'group', value: 'group' }])
  })

  it('parses mixed group and dynamic segments', () => {
    const result = parseSegment('(group)[slug]')
    expect(result).toEqual([
      { type: 'group', value: 'group' },
      { type: 'dynamic', value: 'slug' },
    ])
  })

  it('throws error for empty groups', () => {
    expect(() => parseSegment('()')).toThrow('Empty group')
  })

  it('throws error for unfinished groups', () => {
    expect(() => parseSegment('(unfinished')).toThrow('Unfinished group')
  })
})

describe('multiple extensions support', () => {
  it('handles custom extensions', () => {
    expect(parsePath(['api/users.json'], { extensions: ['.vue', '.json'] })[0]).toMatchObject({
      segments: [
        [{ type: 'static', value: 'api' }],
        [{ type: 'static', value: 'users' }],
      ],
    })
  })

  it('preserves extensions not in allow list', () => {
    expect(parsePath(['api/users.xml'], { extensions: ['.vue', '.json'] })[0]).toMatchObject({
      segments: [
        [{ type: 'static', value: 'api' }],
        [{ type: 'static', value: 'users.xml' }],
      ],
    })
  })

  it('strips all extensions when no extensions specified', () => {
    expect(parsePath(['api/users.xml'])[0]).toMatchObject({
      segments: [
        [{ type: 'static', value: 'api' }],
        [{ type: 'static', value: 'users' }],
      ],
    })
  })
})
describe('roots', () => {
  it('should strip single root from file paths', () => {
    const filePaths = ['src/pages/index.vue', 'src/pages/about.vue']
    const result = parsePath(filePaths, { roots: ['src/pages'] })

    expect(result).toEqual([
      {
        file: 'src/pages/index.vue',
        segments: [[{ type: 'static', value: '' }]],
        meta: undefined,
      },
      {
        file: 'src/pages/about.vue',
        segments: [[{ type: 'static', value: 'about' }]],
        meta: undefined,
      },
    ])
  })

  it('should strip most specific root first', () => {
    const filePaths = ['src/pages/admin/users.vue']
    const result = parsePath(filePaths, {
      roots: ['src', 'src/pages', 'src/pages/admin'],
    })

    expect(result).toEqual([
      {
        file: 'src/pages/admin/users.vue',
        segments: [[{ type: 'static', value: 'users' }]],
        meta: undefined,
      },
    ])
  })

  it('should handle exact path matches', () => {
    // Test exact directory match with trailing slash
    const filePaths = ['src/pages/']
    const result = parsePath(filePaths, { roots: ['src/pages'] })

    expect(result).toEqual([
      {
        file: 'src/pages/',
        segments: [[{ type: 'static', value: '' }]],
        meta: undefined,
      },
    ])
  })

  it('should not strip if no matching root', () => {
    const filePaths = ['other/pages/index.vue']
    const result = parsePath(filePaths, { roots: ['src/pages'] })

    expect(result).toEqual([
      {
        file: 'other/pages/index.vue',
        segments: [
          [{ type: 'static', value: 'other' }],
          [{ type: 'static', value: 'pages' }],
          [{ type: 'static', value: '' }],
        ],
        meta: undefined,
      },
    ])
  })

  it('should handle empty roots array', () => {
    const filePaths = ['src/pages/index.vue']
    const result = parsePath(filePaths, { roots: [] })

    expect(result).toEqual([
      {
        file: 'src/pages/index.vue',
        segments: [
          [{ type: 'static', value: 'src' }],
          [{ type: 'static', value: 'pages' }],
          [{ type: 'static', value: '' }],
        ],
        meta: undefined,
      },
    ])
  })

  it('should handle roots with trailing slashes', () => {
    const filePaths = ['src/pages/index.vue']
    const result = parsePath(filePaths, { roots: ['src/pages/'] })

    expect(result).toEqual([
      {
        file: 'src/pages/index.vue',
        segments: [[{ type: 'static', value: '' }]],
        meta: undefined,
      },
    ])
  })

  it('should work with complex dynamic paths after root stripping', () => {
    const filePaths = ['src/pages/[slug]/[...rest].vue']
    const result = parsePath(filePaths, { roots: ['src/pages'] })

    expect(result).toEqual([
      {
        file: 'src/pages/[slug]/[...rest].vue',
        segments: [
          [{ type: 'dynamic', value: 'slug' }],
          [{ type: 'catchall', value: 'rest' }],
        ],
        meta: undefined,
      },
    ])
  })

  // Tests to achieve 100% branch coverage
  it('should handle empty path with modes after root stripping', () => {
    const filePaths = ['src/pages/index.client.vue']
    const result = parsePath(filePaths, {
      roots: ['src/pages'],
      modes: ['client', 'server'],
    })

    expect(result).toEqual([
      {
        file: 'src/pages/index.client.vue',
        segments: [[{ type: 'static', value: '' }]],
        meta: { modes: ['client'] },
      },
    ])
  })

  it('should handle empty path with named view after root stripping', () => {
    const filePaths = ['src/pages/index@sidebar.vue']
    const result = parsePath(filePaths, { roots: ['src/pages'] })

    expect(result).toEqual([
      {
        file: 'src/pages/index@sidebar.vue',
        segments: [[{ type: 'static', value: '' }]],
        meta: { name: 'sidebar' },
      },
    ])
  })

  it('should handle empty path with both modes and named view after root stripping', () => {
    const filePaths = ['src/pages/index@sidebar.client.vue']
    const result = parsePath(filePaths, {
      roots: ['src/pages'],
      modes: ['client', 'server'],
    })

    expect(result).toEqual([
      {
        file: 'src/pages/index@sidebar.client.vue',
        segments: [[{ type: 'static', value: '' }]],
        meta: { modes: ['client'], name: 'sidebar' },
      },
    ])
  })
})
