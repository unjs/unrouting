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
  ]
  const errors = [
    '[slug.vue',
    '[].vue',
  ]

  it('throws errors when appropriate', () => {
    for (const path of errors) {
      let err
      try {
        parsePath(path)
      }
      catch (e) {
        err = e
      }
      expect(err).toBeDefined()
    }
  })

  it('works', () => {
    const result = Object.fromEntries(paths.map(path => [path, parsePath(path)]))
    expect(result).toMatchInlineSnapshot(`
      {
        "[...slug].vue": {
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
        "[[sub]]/route-[slug].vue": {
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
        "[slug].vue": {
          "modes": undefined,
          "segments": [
            [
              {
                "type": "dynamic",
                "value": "slug",
              },
            ],
          ],
        },
        "file.vue": {
          "modes": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "file",
              },
            ],
          ],
        },
        "optional/[[opt]]-postfix.vue": {
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
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
          "modes": undefined,
          "segments": [
            [
              {
                "type": "static",
                "value": "test:name",
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
    const result = parsePath('app.server.vue', { modes: ['server', 'client'] })
    expect(result.modes).toEqual(['server'])
    expect(result.segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects client mode when configured', () => {
    const result = parsePath('app.client.vue', { modes: ['server', 'client'] })
    expect(result.modes).toEqual(['client'])
    expect(result.segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('has no modes for regular files', () => {
    const result = parsePath('app.vue')
    expect(result.modes).toBeUndefined()
    expect(result.segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('ignores mode-like extensions without configuration', () => {
    const result = parsePath('app.server.vue')
    expect(result.modes).toBeUndefined()
    expect(result.segments).toEqual([[{ type: 'static', value: 'app.server' }]])
  })

  it('detects multiple modes in correct order', () => {
    const result = parsePath('app.client.vapor.vue', { modes: ['client', 'server', 'vapor'] })
    expect(result.modes).toEqual(['client', 'vapor'])
    expect(result.segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects custom modes', () => {
    const result = parsePath('app.mobile.vue', { modes: ['mobile', 'desktop'] })
    expect(result.modes).toEqual(['mobile'])
    expect(result.segments).toEqual([[{ type: 'static', value: 'app' }]])
  })

  it('detects multiple custom modes', () => {
    const result = parsePath('admin.desktop.dark.vue', { modes: ['mobile', 'desktop', 'dark', 'light'] })
    expect(result.modes).toEqual(['desktop', 'dark'])
    expect(result.segments).toEqual([[{ type: 'static', value: 'admin' }]])
  })

  it('ignores unknown modes', () => {
    const result = parsePath('app.unknown.vue', { modes: ['client', 'server'] })
    expect(result.modes).toBeUndefined()
    expect(result.segments).toEqual([[{ type: 'static', value: 'app.unknown' }]])
  })

  it('works with empty modes array', () => {
    const result = parsePath('app.client.vue', { modes: [] })
    expect(result.modes).toBeUndefined()
    expect(result.segments).toEqual([[{ type: 'static', value: 'app.client' }]])
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
