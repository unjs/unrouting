import type { ParsedPathSegment, ParsedPathSegmentToken } from './parse'
import type { RouteNodeFile, RouteTree } from './tree'

import escapeStringRegexp from 'escape-string-regexp'
import { encodePath, joinURL } from 'ufo'

const collator = new Intl.Collator('en-US')

// --- Types -------------------------------------------------------------------

export interface VueRoute {
  name?: string
  path: string
  file?: string
  /** Named view files keyed by view name. Only present when named views exist. */
  components?: Record<string, string>
  modes?: string[]
  children: VueRoute[]
  meta?: Record<string, unknown>
}

export interface VueRouterEmitOptions {
  /**
   * Custom route name generator.
   * Receives `/`-separated name (e.g. `'users/id'`), returns final name.
   * Default: Nuxt-style — strip trailing `/index`, replace `/` with `-`.
   */
  getRouteName?: (rawName: string) => string

  /** Called when two routes resolve to the same generated name. */
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

// --- Flatten tree ------------------------------------------------------------

interface FlatFileInfo {
  file: string
  relativePath: string
  segments: ParsedPathSegment[]
  groups: string[]
  siblingFiles: RouteNodeFile[]
}

function flattenTree(tree: RouteTree): FlatFileInfo[] {
  const infos: FlatFileInfo[] = []
  ;(function walk(node) {
    const defaults = node.files.filter(f => f.viewName === 'default')
    const views = node.files.filter(f => f.viewName !== 'default')

    // Group by group-path — mode variants share a group path
    const byGroupPath = new Map<string, RouteNodeFile[]>()
    for (const f of (defaults.length > 0 ? defaults : node.files)) {
      const key = f.groups.join(',')
      let group = byGroupPath.get(key)
      if (!group) {
        group = []
        byGroupPath.set(key, group)
      }
      group.push(f)
    }

    for (const [groupKey, groupFiles] of byGroupPath) {
      const primary = groupFiles[0]
      const segments: ParsedPathSegment[] = []
      for (const seg of primary.originalSegments) {
        if (!seg.every(t => t.type === 'group'))
          segments.push(seg)
      }
      infos.push({
        file: primary.path,
        relativePath: primary.relativePath,
        segments,
        groups: primary.groups,
        siblingFiles: [
          ...groupFiles,
          ...views.filter(v => v.groups.join(',') === groupKey),
        ],
      })
    }
    for (const child of node.children.values()) walk(child)
  })(tree.root)
  return infos
}

// --- Vue Router 4 ------------------------------------------------------------

/**
 * Convert a route tree to Vue Router 4 route definitions.
 */
export function toVueRouter4(tree: RouteTree, options?: VueRouterEmitOptions): VueRoute[] {
  const fileInfos = flattenTree(tree)

  fileInfos.sort((a, b) =>
    a.relativePath.length - b.relativePath.length
    || collator.compare(a.relativePath, b.relativePath),
  )

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

    if (info.segments.length === 0)
      route.path = '/'

    for (let i = 0; i < info.segments.length; i++) {
      const seg = info.segments[i]
      const isIndex = isIndexSegment(seg)
      const segmentName = isIndex
        ? 'index'
        : seg.map(t => t.type === 'group' ? '' : t.value).join('')

      route.name += (route.name && '/') + segmentName

      const nextSeg = i < info.segments.length - 1 ? info.segments[i + 1] : undefined
      const hasNextNonIndex = !!nextSeg && !isIndexSegment(nextSeg)
      const routePath = `/${toVueRouterSegment(seg, { hasSucceeding: hasNextNonIndex })}`
      const fullPath = joinURL(route.path || '/', isIndex ? '/' : routePath)
      const normalizedFullPath = fullPath.replaceAll('([^/]*)*', '(.*)*')

      const match = parent.find(r =>
        r.name === route.name
        && r.path === normalizedFullPath,
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

// --- rou3 --------------------------------------------------------------------

export function toRou3(tree: RouteTree): Rou3Route[] {
  return flattenTree(tree).map((info) => {
    let path = '/'
    for (const segment of info.segments) {
      if (segment.every(t => t.type === 'group'))
        continue

      let part = ''
      for (const token of segment) {
        switch (token.type) {
          case 'group':
            break
          case 'static': {
            part += token.value
            break
          }
          case 'dynamic': {
            part += token.value ? `:${token.value}` : '*'
            break
          }
          case 'catchall': {
            part += token.value ? `**:${token.value}` : '**'
            break
          }
          case 'optional': throw new TypeError('[unrouting] `toRou3` does not support optional parameters')
          case 'repeatable': throw new TypeError('[unrouting] `toRou3` does not support repeatable parameters')
          case 'optional-repeatable': throw new TypeError('[unrouting] `toRou3` does not support optional repeatable parameters')
        }
      }
      if (part)
        path = joinURL(path, part)
    }
    return { path, file: info.file }
  })
}

// --- RegExp ------------------------------------------------------------------

export function toRegExp(tree: RouteTree): RegExpRoute[] {
  return flattenTree(tree).map((info) => {
    const keys: string[] = []
    let source = '^'

    for (const segment of info.segments) {
      if (segment.every(t => t.type === 'group'))
        continue

      let re = ''
      for (const token of segment) {
        const key = sanitizeCaptureGroup(token.value)
        switch (token.type) {
          case 'static':
            re += escapeStringRegexp(token.value)
            break
          case 'dynamic':
            keys.push(key)
            re += `(?<${key}>[^/]+)`
            break
          case 'optional':
            keys.push(key)
            re += `(?<${key}>[^/]*)`
            break
          case 'repeatable':
            keys.push(key)
            re += `(?<${key}>[^/]+(?:/[^/]+)*)`
            break
          case 'optional-repeatable':
            keys.push(key)
            re += `(?<${key}>[^/]*(?:/[^/]+)*)`
            break
          case 'catchall':
            keys.push(key)
            re += `(?<${key}>.*)`
            break
        }
      }

      const isOptional = segment.every(t =>
        t.type === 'optional' || t.type === 'catchall' || t.type === 'group' || t.type === 'optional-repeatable',
      )
      if (re)
        source += isOptional ? `(?:\\/${re})?` : `\\/${re}`
    }

    source += '\\/?$'
    return { pattern: new RegExp(source), keys, file: info.file }
  })
}

// --- Route ordering ----------------------------------------------------------

function compareRoutes(a: IntermediateRoute, b: IntermediateRoute): number {
  const aScore = a.scoreSegments!
  const bScore = b.scoreSegments!
  const len = Math.max(aScore.length, bScore.length)

  for (let i = 0; i < len; i++) {
    const sa = aScore[i] ?? -Infinity
    const sb = bScore[i] ?? -Infinity
    if (sa !== sb)
      return sb - sa
  }

  // Tie-break: fewer path segments first, then alphabetical
  if (a.pathSegmentCount !== b.pathSegmentCount)
    return a.pathSegmentCount! - b.pathSegmentCount!

  return collator.compare(a.path, b.path)
}

// --- Segment / path converters (public) --------------------------------------

export interface ToVueRouterSegmentOptions {
  /**
   * Whether there are non-index segments following this one.
   * When `true`, catchall tokens use `([^/]*)*` (restrictive);
   * when `false` (default), they use `(.*)*` (permissive).
   */
  hasSucceeding?: boolean
}

/**
 * Convert a single parsed segment (an array of tokens returned by
 * `parseSegment`) into a Vue Router 4 path segment string.
 *
 * @example
 * const tokens = parseSegment('[id]')
 * toVueRouterSegment(tokens) // => ':id()'
 */
export function toVueRouterSegment(
  tokens: ParsedPathSegmentToken[],
  options?: ToVueRouterSegmentOptions,
): string {
  const hasSucceeding = options?.hasSucceeding ?? false
  let out = ''
  for (const token of tokens) {
    switch (token.type) {
      case 'group':
        continue
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

/**
 * Convert an array of parsed path segments into a full Vue Router 4 path
 * string. Automatically determines `hasSucceeding` for each segment so that
 * mid-path catchalls use the restrictive `([^/]*)*` pattern.
 *
 * @example
 * const parsed = parsePath(['users/[id].vue'])[0]
 * toVueRouterPath(parsed.segments) // => '/users/:id()'
 */
export function toVueRouterPath(segments: ParsedPathSegment[]): string {
  let path = ''
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Skip group-only segments (they don't produce path output)
    if (seg.every(t => t.type === 'group'))
      continue

    // Skip index segments (single empty-string static token)
    if (isIndexSegment(seg))
      continue

    const nextNonIndex = segments.slice(i + 1).find(s => !isIndexSegment(s) && !s.every(t => t.type === 'group'))
    const hasSucceeding = !!nextNonIndex

    path += `/${toVueRouterSegment(seg, { hasSucceeding })}`
  }
  return path || '/'
}

// --- Internals ---------------------------------------------------------------

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
  scoreSegments?: number[]
  pathSegmentCount?: number
}

const INDEX_RE = /\/index$/
const SLASH_RE = /\//g

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

  for (const route of routes) {
    route.scoreSegments = computeScoreSegments(route)
    route.pathSegmentCount = route.path.split('/').filter(Boolean).length
  }
  routes.sort(compareRoutes)

  return routes.map((route) => {
    let name: string | undefined = getRouteName(route.name)
    let path = route.path
    if (parent && path[0] === '/')
      path = path.slice(1)

    const children = route.children.length ? prepareRoutes(route.children, route, options, names) : []
    if (children.some(c => c.path === ''))
      name = undefined

    if (name !== undefined) {
      if (options?.onDuplicateRouteName) {
        const existingFile = names.get(name)
        if (existingFile)
          options.onDuplicateRouteName(name, route.file, existingFile)
      }
      names.set(name, route.file)
    }

    const out: VueRoute = { path, file: route.file, children }
    if (name !== undefined)
      out.name = name
    if (route.groups.length > 0)
      out.meta = { ...out.meta, groups: route.groups }

    // Named views
    const views = route.siblingFiles.filter(f => f.viewName !== 'default')
    if (views.length > 0) {
      out.components = { default: route.file }
      for (const v of views)
        out.components[v.viewName] = v.path
    }

    // Modes
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

/** Unescaped colon = dynamic param marker in vue-router path format. */
const UNESCAPED_COLON_RE = /(?:^|[^\\]):/

function computeScoreSegments(route: IntermediateRoute): number[] {
  return route.path.split('/').filter(Boolean).map((part) => {
    if (part.includes('(.*)*') || part.includes('([^/]*)*'))
      return -400
    if (UNESCAPED_COLON_RE.test(part))
      return part.includes('?') ? 100 : part.includes('+') ? 200 : part.includes('*') ? 50 : 300
    return 400
  })
}

function sanitizeCaptureGroup(value: string): string {
  return value.replace(/^(\d)/, '_$1').replace(/\./g, '')
}
