import { describe, expect, it } from 'vitest'
import { parsePath } from '../../src'

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
        "[...slug].vue": [
          [
            {
              "type": "catchall",
              "value": "slug",
            },
          ],
        ],
        "[[c3@3c]].vue": [
          [
            {
              "type": "optional",
              "value": "c33c",
            },
          ],
        ],
        "[[d4-4d]].vue": [
          [
            {
              "type": "optional",
              "value": "d44d",
            },
          ],
        ],
        "[[foo]]/index.vue": [
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
        "[[sub]]/route-[slug].vue": [
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
        "[a1_1a].vue": [
          [
            {
              "type": "dynamic",
              "value": "a1_1a",
            },
          ],
        ],
        "[b2.2b].vue": [
          [
            {
              "type": "dynamic",
              "value": "b2.2b",
            },
          ],
        ],
        "[b2]_[2b].vue": [
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
        "[slug].vue": [
          [
            {
              "type": "dynamic",
              "value": "slug",
            },
          ],
        ],
        "file.vue": [
          [
            {
              "type": "static",
              "value": "file",
            },
          ],
        ],
        "optional/[[opt]]-postfix.vue": [
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
        "optional/[[opt]].vue": [
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
        "optional/prefix-[[opt]]-postfix.vue": [
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
        "optional/prefix-[[opt]].vue": [
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
        "test.html.vue": [
          [
            {
              "type": "static",
              "value": "test.html",
            },
          ],
        ],
        "test:name.vue": [
          [
            {
              "type": "static",
              "value": "test:name",
            },
          ],
        ],
      }
    `)
  })
})
