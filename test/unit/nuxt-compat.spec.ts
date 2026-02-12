/**
 * Acceptance criteria tests ported from Nuxt's packages/nuxt/test/pages.test.ts
 *
 * These test the full pipeline: file paths → buildTree → toVueRouter4
 * to ensure unrouting produces identical output to Nuxt's generateRoutesFromFiles.
 *
 * Nuxt's own tests sort routes by path (descending) before comparison, so route
 * ordering within the same parent level is not significant. We do the same.
 */
import { describe, expect, it } from 'vitest'
import { buildTree, toVueRouter4 } from '../../src'

// Sort routes the same way Nuxt's tests do (by path descending, recursively)
const collator = new Intl.Collator('en-US')
function sortRoutes(routes: any[]): any[] {
  return [...routes]
    .map(r => ({ ...r, children: r.children ? sortRoutes(r.children) : [] }))
    .sort((a: any, b: any) => collator.compare(b.path, a.path))
}

// Single-pass: raw file paths → tree → vue-router routes
function generateRoutes(filePaths: string[], roots: string[] = ['pages/']) {
  return toVueRouter4(buildTree(filePaths, { roots }))
}

function expectRoutes(result: any[], expected: any[]) {
  expect(sortRoutes(result)).toEqual(sortRoutes(expected))
}

const pagesDir = 'pages'
const layerDir = 'layer/pages'

describe('nuxt compatibility: generateRoutes from files', () => {
  it('should generate correct routes for index pages', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/index.vue`,
      `${pagesDir}/parent/index.vue`,
      `${pagesDir}/parent/child/index.vue`,
    ]), [
      { name: 'index', path: '/', file: `${pagesDir}/index.vue`, children: [] },
      { name: 'parent', path: '/parent', file: `${pagesDir}/parent/index.vue`, children: [] },
      { name: 'parent-child', path: '/parent/child', file: `${pagesDir}/parent/child/index.vue`, children: [] },
    ])
  })

  it('should generate correct routes for parent/child', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/parent.vue`,
      `${pagesDir}/parent/child.vue`,
    ]), [
      {
        name: 'parent',
        path: '/parent',
        file: `${pagesDir}/parent.vue`,
        children: [
          { name: 'parent-child', path: 'child', file: `${pagesDir}/parent/child.vue`, children: [] },
        ],
      },
    ])
  })

  it('should not generate colliding route names when hyphens are in file name', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/parent/[child].vue`,
      `${pagesDir}/parent-[child].vue`,
    ]), [
      { name: 'parent-child', path: '/parent/:child()', file: `${pagesDir}/parent/[child].vue`, children: [] },
      { name: 'parent-child', path: '/parent-:child()', file: `${pagesDir}/parent-[child].vue`, children: [] },
    ])
  })

  it('should generate correct id for catchall (order 1)', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/[...stories].vue`,
      `${pagesDir}/stories/[id].vue`,
    ]), [
      { name: 'stories', path: '/:stories(.*)*', file: `${pagesDir}/[...stories].vue`, children: [] },
      { name: 'stories-id', path: '/stories/:id()', file: `${pagesDir}/stories/[id].vue`, children: [] },
    ])
  })

  it('should generate correct id for catchall (order 2)', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/stories/[id].vue`,
      `${pagesDir}/[...stories].vue`,
    ]), [
      { name: 'stories-id', path: '/stories/:id()', file: `${pagesDir}/stories/[id].vue`, children: [] },
      { name: 'stories', path: '/:stories(.*)*', file: `${pagesDir}/[...stories].vue`, children: [] },
    ])
  })

  it('should generate correct route for snake_case file', () => {
    expectRoutes(generateRoutes([`${pagesDir}/snake_case.vue`]), [
      { name: 'snake_case', path: '/snake_case', file: `${pagesDir}/snake_case.vue`, children: [] },
    ])
  })

  it('should generate correct route for kebab-case file', () => {
    expectRoutes(generateRoutes([`${pagesDir}/kebab-case.vue`]), [
      { name: 'kebab-case', path: '/kebab-case', file: `${pagesDir}/kebab-case.vue`, children: [] },
    ])
  })

  it('should generate correct dynamic routes', () => {
    const result = generateRoutes([
      `${pagesDir}/index.vue`,
      `${pagesDir}/[slug].vue`,
      `${pagesDir}/[[foo]]`,
      `${pagesDir}/[[foo]]/index.vue`,
      `${pagesDir}/optional/[[opt]].vue`,
      `${pagesDir}/optional/prefix-[[opt]].vue`,
      `${pagesDir}/optional/[[opt]]-postfix.vue`,
      `${pagesDir}/optional/prefix-[[opt]]-postfix.vue`,
      `${pagesDir}/[bar]/index.vue`,
      `${pagesDir}/nonopt/[slug].vue`,
      `${pagesDir}/opt/[[slug]].vue`,
      `${pagesDir}/[[sub]]/route-[slug].vue`,
    ])

    const byPath = (p: string) => result.find((r: any) => r.path === p)

    expect(byPath('/')).toMatchObject({ name: 'index', file: `${pagesDir}/index.vue`, children: [] })
    expect(byPath('/:slug()')).toMatchObject({ name: 'slug', file: `${pagesDir}/[slug].vue`, children: [] })
    expect(byPath('/:bar()')).toMatchObject({ name: 'bar', file: `${pagesDir}/[bar]/index.vue`, children: [] })
    expect(byPath('/opt/:slug?')).toMatchObject({ name: 'opt-slug', file: `${pagesDir}/opt/[[slug]].vue`, children: [] })
    expect(byPath('/nonopt/:slug()')).toMatchObject({ name: 'nonopt-slug', file: `${pagesDir}/nonopt/[slug].vue`, children: [] })
    expect(byPath('/optional/:opt?')).toMatchObject({ name: 'optional-opt', file: `${pagesDir}/optional/[[opt]].vue`, children: [] })
    expect(byPath('/:sub?/route-:slug()')).toMatchObject({ name: 'sub-route-slug', file: `${pagesDir}/[[sub]]/route-[slug].vue`, children: [] })
    expect(byPath('/optional/prefix-:opt?')).toMatchObject({ name: 'optional-prefix-opt', file: `${pagesDir}/optional/prefix-[[opt]].vue`, children: [] })
    expect(byPath('/optional/:opt?-postfix')).toMatchObject({ name: 'optional-opt-postfix', file: `${pagesDir}/optional/[[opt]]-postfix.vue`, children: [] })
    expect(byPath('/optional/prefix-:opt?-postfix')).toMatchObject({ name: 'optional-prefix-opt-postfix', file: `${pagesDir}/optional/prefix-[[opt]]-postfix.vue`, children: [] })

    // [[foo]] layout with index child
    const fooRoute = byPath('/:foo?')
    expect(fooRoute).toBeDefined()
    expect(fooRoute!.file).toBe(`${pagesDir}/[[foo]]`)
    expect(fooRoute!.children).toEqual([
      { name: 'foo', path: '', file: `${pagesDir}/[[foo]]/index.vue`, children: [] },
    ])
    expect((fooRoute as any).name).toBeUndefined()
  })

  it('should generate correct catch-all route', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/[...slug].vue`,
      `${pagesDir}/index.vue`,
      `${pagesDir}/[...slug]/[id].vue`,
    ]), [
      { name: 'index', path: '/', file: `${pagesDir}/index.vue`, children: [] },
      {
        name: 'slug',
        path: '/:slug(.*)*',
        file: `${pagesDir}/[...slug].vue`,
        children: [
          { name: 'slug-id', path: ':id()', file: `${pagesDir}/[...slug]/[id].vue`, children: [] },
        ],
      },
    ])
  })

  it('should throw unfinished param error for dynamic route', () => {
    expect(() => generateRoutes([`${pagesDir}/[slug.vue`])).toThrow('Unfinished param "slug"')
  })

  it('should throw empty param error for dynamic route', () => {
    expect(() => generateRoutes([`${pagesDir}/[].vue`])).toThrow('Empty param')
  })

  it('should only allow "_" & "." as special characters for dynamic route', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/[a1_1a].vue`,
      `${pagesDir}/[b2.2b].vue`,
      `${pagesDir}/[b2]_[2b].vue`,
      `${pagesDir}/[[c3@3c]].vue`,
      `${pagesDir}/[[d4-4d]].vue`,
    ]), [
      { name: 'a1_1a', path: '/:a1_1a()', file: `${pagesDir}/[a1_1a].vue`, children: [] },
      { name: 'b2.2b', path: '/:b2.2b()', file: `${pagesDir}/[b2.2b].vue`, children: [] },
      { name: 'b2_2b', path: '/:b2()_:2b()', file: `${pagesDir}/[b2]_[2b].vue`, children: [] },
      { name: 'c33c', path: '/:c33c?', file: `${pagesDir}/[[c3@3c]].vue`, children: [] },
      { name: 'd44d', path: '/:d44d?', file: `${pagesDir}/[[d4-4d]].vue`, children: [] },
    ])
  })

  it('should allow pages with `:` in their path', () => {
    expectRoutes(generateRoutes([`${pagesDir}/test:name.vue`]), [
      { name: 'test:name', path: '/test\\:name', file: `${pagesDir}/test:name.vue`, children: [] },
    ])
  })

  it('should handle unicode and special characters in page paths', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/\u6D4B\u8BD5.vue`,
      `${pagesDir}/\u6587\u6863.vue`,
      `${pagesDir}/\u6587\u6863/\u4ECB\u7ECD.vue`,
      `${pagesDir}/\u062E\u0627\u0635:\u062C\u062F\u064A\u062F.vue`,
    ]), [
      { name: '\u6D4B\u8BD5', path: `/${encodeURIComponent('\u6D4B\u8BD5')}`, file: `${pagesDir}/\u6D4B\u8BD5.vue`, children: [] },
      {
        name: '\u6587\u6863',
        path: `/${encodeURIComponent('\u6587\u6863')}`,
        file: `${pagesDir}/\u6587\u6863.vue`,
        children: [
          { name: '\u6587\u6863-\u4ECB\u7ECD', path: encodeURIComponent('\u4ECB\u7ECD'), file: `${pagesDir}/\u6587\u6863/\u4ECB\u7ECD.vue`, children: [] },
        ],
      },
      { name: '\u062E\u0627\u0635:\u062C\u062F\u064A\u062F', path: `/${encodeURIComponent('\u062E\u0627\u0635')}\\:${encodeURIComponent('\u062C\u062F\u064A\u062F')}`, file: `${pagesDir}/\u062E\u0627\u0635:\u062C\u062F\u064A\u062F.vue`, children: [] },
    ])
  })

  it('should escape special chars in static paths', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/a&b.vue`,
      `${pagesDir}/a\\b.vue`,
    ]), [
      { name: 'a&b', path: `/a${encodeURIComponent('&')}b`, file: `${pagesDir}/a&b.vue`, children: [] },
      { name: 'a\\b', path: `/a${encodeURIComponent('\\')}b`, file: `${pagesDir}/a\\b.vue`, children: [] },
    ])
  })

  it('should not merge required param as a child of optional param', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/[[foo]].vue`,
      `${pagesDir}/[foo].vue`,
    ]), [
      { name: 'foo', path: '/:foo()', file: `${pagesDir}/[foo].vue`, children: [] },
      { name: 'foo', path: '/:foo?', file: `${pagesDir}/[[foo]].vue`, children: [] },
    ])
  })

  it('should correctly merge nested routes across layers', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/param.vue`,
      `${layerDir}/param/index.vue`,
      `${pagesDir}/param/index/index.vue`,
      `${layerDir}/param/index/sibling.vue`,
      `${pagesDir}/wrapper-expose/other.vue`,
      `${layerDir}/wrapper-expose/other/index.vue`,
      `${pagesDir}/wrapper-expose/other/sibling.vue`,
      `${pagesDir}/param/sibling.vue`,
    ], ['pages/', 'layer/pages/']), [
      {
        path: '/param',
        file: `${pagesDir}/param.vue`,
        children: [
          {
            path: '',
            file: `${layerDir}/param/index.vue`,
            children: [
              { children: [], file: `${pagesDir}/param/index/index.vue`, name: 'param-index', path: '' },
              { children: [], file: `${layerDir}/param/index/sibling.vue`, name: 'param-index-sibling', path: 'sibling' },
            ],
          },
          { children: [], file: `${pagesDir}/param/sibling.vue`, name: 'param-sibling', path: 'sibling' },
        ],
      },
      {
        path: '/wrapper-expose/other',
        file: `${pagesDir}/wrapper-expose/other.vue`,
        children: [
          { children: [], file: `${layerDir}/wrapper-expose/other/index.vue`, name: 'wrapper-expose-other', path: '' },
          { children: [], file: `${pagesDir}/wrapper-expose/other/sibling.vue`, name: 'wrapper-expose-other-sibling', path: 'sibling' },
        ],
      },
    ])
  })

  it('should handle trailing slashes with index routes', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/index/index.vue`,
      `${pagesDir}/index/index/all.vue`,
    ]), [
      {
        name: 'index',
        path: '/',
        file: `${pagesDir}/index/index.vue`,
        children: [
          { children: [], file: `${pagesDir}/index/index/all.vue`, name: 'index-index-all', path: 'all' },
        ],
      },
    ])
  })

  it('should generate correct routes for nested pages with index', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/page1/index.vue`,
      `${pagesDir}/page1/[id].vue`,
      `${pagesDir}/page1.vue`,
    ]), [
      {
        path: '/page1',
        file: `${pagesDir}/page1.vue`,
        children: [
          { children: [], file: `${pagesDir}/page1/[id].vue`, name: 'page1-id', path: ':id()' },
          { children: [], file: `${pagesDir}/page1/index.vue`, name: 'page1', path: '' },
        ],
      },
    ])
  })

  it('should use more performant regexp when catchall is used in middle of path', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/[...id]/suffix.vue`,
      `${pagesDir}/[...id]/index.vue`,
    ]), [
      { name: 'id', path: '/:id(.*)*', file: `${pagesDir}/[...id]/index.vue`, children: [] },
      { name: 'id-suffix', path: '/:id([^/]*)*/suffix', file: `${pagesDir}/[...id]/suffix.vue`, children: [] },
    ])
  })

  it('should handle route groups', () => {
    expectRoutes(generateRoutes([
      `${pagesDir}/(foo)/index.vue`,
      `${pagesDir}/(foo)/about.vue`,
      `${pagesDir}/(bar)/about/index.vue`,
      `${pagesDir}/(bar)/about/(foo)/index.vue`,
    ]), [
      { name: 'index', path: '/', file: `${pagesDir}/(foo)/index.vue`, meta: { groups: ['foo'] }, children: [] },
      {
        path: '/about',
        file: `${pagesDir}/(foo)/about.vue`,
        meta: { groups: ['foo'] },
        children: [
          {
            path: '',
            file: `${pagesDir}/(bar)/about/index.vue`,
            meta: { groups: ['bar'] },
            children: [
              { name: 'about', path: '', file: `${pagesDir}/(bar)/about/(foo)/index.vue`, meta: { groups: ['bar', 'foo'] }, children: [] },
            ],
          },
        ],
      },
    ])
  })
})
