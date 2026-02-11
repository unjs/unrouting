import type { ParsedPathSegment } from './parse'
import type { RouteNodeFile, RouteTree } from './tree'

import escapeStringRegexp from 'escape-string-regexp'
import { encodePath, joinURL } from 'ufo'

// ============================================================================
// Types
// ============================================================================

export interface VueRoute {
  name?: string
  path: string
  /** Primary file (the 'default' view) */
  file?: string
  /**
   * All files for this route keyed by view name.
   * Only present when named views exist.
   * E.g. `{ default: 'index.vue', sidebar: 'index@sidebar.vue' }`
   */
  components?: Record<string, string>
  /** Mode(s) this route operates in (e.g. ['client'], ['server']) */
  modes?: string[]
  children: VueRoute[]
  meta?: Record<string, unknown>
}

export interface VueRouterEmitOptions {
  /**
   * Custom route name generator.
   * Receives the intermediate `/`-separated name built during tree traversal
   * (e.g. `'users/id'`) and should return the final name (e.g. `'users-id'`).
   *
   * Default: Nuxt-style — strip trailing `/index`, replace `/` with `-`.
   */
  getRouteName?: (rawName: string) => string

  /**
   * Called when two routes have the same generated name.
   * Useful for warning users about potential conflicts
   * (e.g. `parent/[child].vue` and `parent-[child].vue` both produce `parent-child`).
   */
  onDuplicateRouteName?: (name: string, file: string, existingFile: string) => void
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
  /** All RouteNodeFiles at the same tree position (for views/modes) */
  siblingFiles: RouteNodeFile[]
}

function flattenTree(tree: RouteTree): FlatFileInfo[] {
  const infos: FlatFileInfo[] = []
  ;(function walk(node) {
    // Group node files by (viewName='default', groupPath). Files that share
    // the same group path but differ in modes or views are ONE route entry.
    // Different group paths produce separate route entries (e.g. (foo)/index.vue
    // vs (bar)/index.vue).
    const defaults = node.files.filter(f => f.viewName === 'default')
    const views = node.files.filter(f => f.viewName !== 'default')

    // Group defaults by their group path — mode variants share a group path
    const byGroupPath = new Map<string, RouteNodeFile[]>()
    for (const f of (defaults.length > 0 ? defaults : node.files)) {
      const key = f.groups.join(',')
      if (!byGroupPath.has(key))
        byGroupPath.set(key, [])
      byGroupPath.get(key)!.push(f)
    }

    for (const [groupKey, groupFiles] of byGroupPath) {
      // Pick the first file as the primary (drives path/name/file)
      const primary = groupFiles[0]
      const segments: ParsedPathSegment[] = []
      for (const seg of primary.originalSegments) {
        if (seg.every(t => t.type === 'group'))
          continue
        segments.push(seg)
      }
      // Siblings: all files with same group path (mode variants + named views)
      const siblings = [
        ...groupFiles,
        ...views.filter(v => v.groups.join(',') === groupKey),
      ]
      infos.push({
        file: primary.path,
        relativePath: primary.relativePath,
        segments,
        groups: primary.groups,
        siblingFiles: siblings,
      })
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
 * route groups, layer merging, catchall optimisation, route ordering,
 * named views, and mode variants.
 */
export function toVueRouter4(tree: RouteTree, options?: VueRouterEmitOptions): VueRoute[] {
  const fileInfos = flattenTree(tree)

  // Sort like Nuxt: alphabetically first, then by path length (stable sort)
  const collator = new Intl.Collator('en-US')
  fileInfos.sort((a, b) => collator.compare(a.relativePath, b.relativePath))
  fileInfos.sort((a, b) => a.relativePath.length - b.relativePath.length)

  // Build routes using name+path matching nesting algorithm
  const routes: IntermediateRoute[] = []

  for (const info of fileInfos) {
    const route: IntermediateRoute = {
      name: '',
      path: '',
      file: info.file,
      children: [],
      groups: info.groups,
      siblingFiles: info.siblingFiles,
    }
    let parent = routes

    // Files with no effective segments (e.g., purely group paths)
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
// Route ordering / priority scoring
// ============================================================================

/**
 * Compare two routes for ordering.
 * Returns negative if a should come first, positive if b should come first.
 */
function compareRoutes(a: IntermediateRoute, b: IntermediateRoute): number {
  // Compare segment by segment using pre-computed score segments
  const aScore = a.scoreSegments || []
  const bScore = b.scoreSegments || []
  const len = Math.max(aScore.length, bScore.length)

  for (let i = 0; i < len; i++) {
    const sa = aScore[i] ?? -Infinity
    const sb = bScore[i] ?? -Infinity
    if (sa !== sb)
      return sb - sa // Higher score first
  }

  // Tie-break: fewer segments first (more specific)
  const aSegments = a.path.split('/').filter(Boolean)
  const bSegments = b.path.split('/').filter(Boolean)
  if (aSegments.length !== bSegments.length)
    return aSegments.length - bSegments.length

  // Final tie-break: alphabetical
  return a.path.localeCompare(b.path, 'en-US')
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
  siblingFiles: RouteNodeFile[]
  /** Pre-computed score for each parsed segment (for ordering) */
  scoreSegments?: number[]
}

const INDEX_RE = /\/index$/
const SLASH_RE = /\//g

/** Default name generator: Nuxt-style (strip /index, replace / with -) */
function defaultGetRouteName(rawName: string): string {
  return rawName.replace(INDEX_RE, '').replace(SLASH_RE, '-') || 'index'
}

function prepareRoutes(
  routes: IntermediateRoute[],
  parent?: IntermediateRoute,
  options?: VueRouterEmitOptions,
  names = new Map<string, string>(),
): VueRoute[] {
  const getRouteName = options?.getRouteName || defaultGetRouteName

  // Compute score segments for ordering
  for (const route of routes) {
    route.scoreSegments = computeScoreSegments(route)
  }

  // Sort siblings by priority
  routes.sort(compareRoutes)

  return routes.map((route) => {
    let name: string | undefined = getRouteName(route.name)
    let path = route.path
    if (parent && path[0] === '/')
      path = path.slice(1)

    const children = route.children.length ? prepareRoutes(route.children, route, options, names) : []
    if (children.some(c => c.path === ''))
      name = undefined

    // Warn about duplicate route names
    if (name !== undefined && options?.onDuplicateRouteName) {
      const existingFile = names.get(name)
      if (existingFile) {
        options.onDuplicateRouteName(name, route.file, existingFile)
      }
      names.set(name, route.file)
    }

    const out: VueRoute = { path, file: route.file, children }
    if (name !== undefined)
      out.name = name
    if (route.groups.length > 0)
      out.meta = { ...out.meta, groups: route.groups }

    // Named views: if there are multiple view files, add `components`
    const views = route.siblingFiles.filter(f => f.viewName !== 'default')
    if (views.length > 0) {
      out.components = { default: route.file }
      for (const v of views)
        out.components[v.viewName] = v.path
    }

    // Modes: collect all unique modes from sibling files
    const allModes = new Set<string>()
    for (const f of route.siblingFiles) {
      if (f.modes) {
        for (const m of f.modes) allModes.add(m)
      }
    }
    if (allModes.size > 0)
      out.modes = [...allModes]

    return out
  })
}

/** Check if a vue-router path segment contains an unescaped colon (dynamic param marker) */
function hasUnescapedColon(part: string): boolean {
  for (let i = 0; i < part.length; i++) {
    if (part[i] === ':' && (i === 0 || part[i - 1] !== '\\'))
      return true
  }
  return false
}

/**
 * Compute score segments from the intermediate route's raw path.
 * The path is in vue-router format, so we score by token patterns.
 */
function computeScoreSegments(route: IntermediateRoute): number[] {
  const parts = route.path.split('/').filter(Boolean)
  return parts.map((part) => {
    // Catchall: lowest priority
    if (part.includes('(.*)*') || part.includes('([^/]*)*'))
      return -400
    // Dynamic parameter — only match unescaped colons (escaped colons like \: are static)
    if (hasUnescapedColon(part))
      return part.includes('?') ? 100 : part.includes('+') ? 200 : part.includes('*') ? 50 : 300
    // Static
    return 400
  })
}

function sanitizeCaptureGroup(value: string): string {
  return value.replace(/^(\d)/, '_$1').replace(/\./g, '')
}
