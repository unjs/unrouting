import type { ParsedPathSegment } from './parse'
import type { RouteTree } from './tree'

import escapeStringRegexp from 'escape-string-regexp'
import { encodePath, joinURL } from 'ufo'

// ============================================================================
// Types
// ============================================================================

export interface VueRoute {
  name?: string
  path: string
  file?: string
  children: VueRoute[]
  meta?: Record<string, unknown>
}

export interface VueRouterEmitOptions {
  /** Custom route name generator. Default: Nuxt-style (segments joined with '-') */
  getRouteName?: (segments: string[]) => string
}

export interface Rou3Route {
  path: string
  file: string
}

export interface RegExpRoute {
  pattern: RegExp
  keys: string[]
  file: string
}

// ============================================================================
// Shared: flatten a tree into per-file segment lists
// ============================================================================

interface FlatFileInfo {
  file: string
  relativePath: string
  /** Effective segments (group-only segments removed) */
  segments: ParsedPathSegment[]
  groups: string[]
}

function flattenTree(tree: RouteTree): FlatFileInfo[] {
  const infos: FlatFileInfo[] = []
  ;(function walk(node) {
    for (const file of node.files) {
      const segments: ParsedPathSegment[] = []
      for (const seg of file.originalSegments) {
        if (seg.every(t => t.type === 'group'))
          continue
        segments.push(seg)
      }
      infos.push({ file: file.path, relativePath: file.relativePath, segments, groups: file.groups })
    }
    for (const child of node.children.values()) walk(child)
  })(tree.root)
  return infos
}

// ============================================================================
// Vue Router 4
// ============================================================================

/**
 * Convert a route tree to Vue Router 4 route definitions.
 *
 * Handles nested routes, index promotion, structural collapse,
 * route groups, layer merging, and catchall optimisation.
 */
export function toVueRouter4(tree: RouteTree, options?: VueRouterEmitOptions): VueRoute[] {
  const fileInfos = flattenTree(tree)

  // Sort like Nuxt: alphabetically first, then by path length (stable sort)
  const collator = new Intl.Collator('en-US')
  fileInfos.sort((a, b) => collator.compare(a.relativePath, b.relativePath))
  fileInfos.sort((a, b) => a.relativePath.length - b.relativePath.length)

  // Build routes using Nuxt's name+path matching nesting algorithm
  const routes: IntermediateRoute[] = []

  for (const info of fileInfos) {
    const route: IntermediateRoute = { name: '', path: '', file: info.file, children: [], groups: info.groups }
    let parent = routes

    // Files with no effective segments (e.g., purely group paths like `(group).vue`)
    // still need a root path
    if (info.segments.length === 0) {
      route.path = '/'
    }

    for (let i = 0; i < info.segments.length; i++) {
      const seg = info.segments[i]
      const isIndex = isIndexSegment(seg)
      const segmentName = isIndex
        ? 'index'
        : seg.map(t => t.type === 'group' ? '' : t.value).join('')

      route.name += (route.name && '/') + segmentName

      const nextSeg = i < info.segments.length - 1 ? info.segments[i + 1] : undefined
      const hasNextNonIndex = !!nextSeg && !isIndexSegment(nextSeg)
      const routePath = `/${generateVueRouterSegment(seg, hasNextNonIndex)}`
      const fullPath = joinURL(route.path || '/', isIndex ? '/' : routePath)

      const match = parent.find(r =>
        r.name === route.name
        && r.path === fullPath.replace('([^/]*)*', '(.*)*'),
      )

      if (match?.children) {
        parent = match.children
        route.path = ''
      }
      else if (segmentName === 'index' && !route.path) {
        route.path += '/'
      }
      else if (segmentName !== 'index') {
        route.path += routePath
      }
    }

    parent.push(route)
  }

  return prepareRoutes(routes, undefined, options)
}

// ============================================================================
// rou3
// ============================================================================

/**
 * Convert a route tree to rou3 route patterns.
 * Produces one pattern per file in the tree.
 */
export function toRou3(tree: RouteTree): Rou3Route[] {
  return flattenTree(tree).map((info) => {
    let path = '/'
    for (const segment of info.segments) {
      if (segment.every(t => t.type === 'group'))
        continue

      let part = ''
      for (const token of segment) {
        if (token.type === 'static')
          part += token.value
        else if (token.type === 'dynamic')
          part += token.value ? `:${token.value}` : '*'
        else if (token.type === 'optional')
          throw new TypeError('[unrouting] `toRou3` does not support optional parameters')
        else if (token.type === 'repeatable')
          throw new TypeError('[unrouting] `toRou3` does not support repeatable parameters')
        else if (token.type === 'optional-repeatable')
          throw new TypeError('[unrouting] `toRou3` does not support optional repeatable parameters')
        else if (token.type === 'catchall')
          part += token.value ? `**:${token.value}` : '**'
      }
      if (part)
        path = joinURL(path, part)
    }
    return { path, file: info.file }
  })
}

// ============================================================================
// RegExp
// ============================================================================

/**
 * Convert a route tree to RegExp matchers.
 * Produces one matcher per file in the tree.
 */
export function toRegExp(tree: RouteTree): RegExpRoute[] {
  return flattenTree(tree).map((info) => {
    const keys: string[] = []
    let sourceRE = '^'

    for (const segment of info.segments) {
      if (segment.every(t => t.type === 'group'))
        continue

      let reSegment = ''
      for (const token of segment) {
        const key = sanitizeCaptureGroup(token.value)
        if (token.type === 'static') {
          reSegment += escapeStringRegexp(token.value)
        }
        else if (token.type === 'dynamic') {
          keys.push(key)
          reSegment += `(?<${key}>[^/]+)`
        }
        else if (token.type === 'optional') {
          keys.push(key)
          reSegment += `(?<${key}>[^/]*)`
        }
        else if (token.type === 'repeatable') {
          keys.push(key)
          reSegment += `(?<${key}>[^/]+(?:/[^/]+)*)`
        }
        else if (token.type === 'optional-repeatable') {
          keys.push(key)
          reSegment += `(?<${key}>[^/]*(?:/[^/]+)*)`
        }
        else if (token.type === 'catchall') {
          keys.push(key)
          reSegment += `(?<${key}>.*)`
        }
      }

      const isOptional = segment.every(t =>
        t.type === 'optional' || t.type === 'catchall' || t.type === 'group' || t.type === 'optional-repeatable',
      )
      if (reSegment)
        sourceRE += isOptional ? `(?:\\/${reSegment})?` : `\\/${reSegment}`
    }

    sourceRE += '\\/?$'
    return { pattern: new RegExp(sourceRE), keys, file: info.file }
  })
}

// ============================================================================
// Internals
// ============================================================================

function generateVueRouterSegment(segment: ParsedPathSegment, hasSucceeding: boolean): string {
  let out = ''
  for (const token of segment) {
    switch (token.type) {
      case 'group': continue
      case 'static':
        out += encodePath(token.value).replace(/:/g, '\\:')
        break
      case 'dynamic':
        out += `:${token.value}()`
        break
      case 'optional':
        out += `:${token.value}?`
        break
      case 'repeatable':
        out += `:${token.value}+`
        break
      case 'optional-repeatable':
        out += `:${token.value}*`
        break
      case 'catchall':
        out += hasSucceeding ? `:${token.value}([^/]*)*` : `:${token.value}(.*)*`
        break
    }
  }
  return out
}

function isIndexSegment(tokens: ParsedPathSegment): boolean {
  return tokens.length === 1 && tokens[0].type === 'static' && tokens[0].value === ''
}

interface IntermediateRoute {
  name: string
  path: string
  file: string
  children: IntermediateRoute[]
  groups: string[]
}

const INDEX_RE = /\/index$/
const SLASH_RE = /\//g

function prepareRoutes(routes: IntermediateRoute[], parent?: IntermediateRoute, _options?: VueRouterEmitOptions): VueRoute[] {
  return routes.map((route) => {
    let name: string | undefined = route.name.replace(INDEX_RE, '').replace(SLASH_RE, '-') || 'index'
    let path = route.path
    if (parent && path[0] === '/')
      path = path.slice(1)

    const children = route.children.length ? prepareRoutes(route.children, route, _options) : []
    if (children.some(c => c.path === ''))
      name = undefined

    const out: VueRoute = { path, file: route.file, children }
    if (name !== undefined)
      out.name = name
    if (route.groups.length > 0)
      out.meta = { groups: route.groups }
    return out
  })
}

function sanitizeCaptureGroup(value: string): string {
  return value.replace(/^(\d)/, '_$1').replace(/\./g, '')
}
