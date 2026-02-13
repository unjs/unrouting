import type { ParsedPathSegment, ParsedPathSegmentToken } from './parse'
import type { RouteNodeFile, RouteTree } from './tree'

import escapeStringRegexp from 'escape-string-regexp'
import { encodePath, joinURL } from 'ufo'

const collator = new Intl.Collator('en-US')

// --- Types -------------------------------------------------------------------

/**
 * Maps an `attrs` record to typed optional properties on the route.
 *
 * Each key becomes an optional property whose value is a single literal
 * from the array. The attr is only set when exactly one mode matches.
 *
 * @example
 * type R = InferAttrs<{ mode: ['client', 'server'] }>
 * // { mode?: 'client' | 'server' }
 */
export type InferAttrs<T extends Record<string, string[]>> = {
  [K in keyof T]?: T[K][number]
}

// eslint-disable-next-line ts/no-empty-object-type
export type VueRoute<Attrs extends Record<string, string[]> = {}> = {
  name?: string
  path: string
  file?: string
  /** Named view files keyed by view name. Only present when named views exist. */
  components?: Record<string, string>
  modes?: string[]
  children: VueRoute<Attrs>[]
  meta?: Record<string, unknown>
} & ([keyof Attrs] extends [never] ? { [key: string]: unknown } : InferAttrs<Attrs>)

// eslint-disable-next-line ts/no-empty-object-type
export interface VueRouterEmitOptions<Attrs extends Record<string, string[]> = {}> {
  /**
   * Custom route name generator.
   * Receives `/`-separated name (e.g. `'users/id'`), returns final name.
   * Default: Nuxt-style — strip trailing `/index`, replace `/` with `-`.
   */
  getRouteName?: (rawName: string) => string

  /** Called when two routes resolve to the same generated name. */
  onDuplicateRouteName?: (name: string, file: string, existingFile: string) => void

  /**
   * Collapse modes into single-value attributes.
   *
   * Each key becomes a typed top-level property on the route. When a route has
   * exactly one matching mode the attribute is set to that value string; when
   * none or multiple modes match, the attribute is omitted and the raw `modes`
   * array is emitted instead.
   *
   * The return type of `toVueRouter4` infers typed properties from the attrs
   * definition so that, e.g., `attrs: { mode: ['client', 'server'] }` produces
   * routes with `mode?: 'client' | 'server'`.
   *
   * @example
   * // Input: route has modes: ['server']
   * toVueRouter4(tree, { attrs: { mode: ['client', 'server'] } })
   * // Output: { ..., mode: 'server' }  (no `modes` property)
   *
   * @example
   * // Custom method-based routing
   * toVueRouter4(tree, { attrs: { method: ['get', 'post'] } })
   * // For a route with modes: ['get'] → { ..., method: 'get' }
   */
  attrs?: Attrs
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
 * Cached intermediate result stored on the tree.
 * @internal
 */
interface CachedVueRouterResult {
  /** The computed routes (used as template for cloning). */
  routes: VueRoute[]
  /** The options fingerprint — if options change, cache is invalid. */
  optionsKey: string
}

/** Deep-clone a VueRoute array. */
function cloneRoutes(routes: VueRoute[]): VueRoute[] {
  return routes.map(r => cloneRoute(r))
}

function cloneRoute(route: VueRoute): VueRoute {
  const clone: VueRoute = {
    path: route.path,
    file: route.file,
    children: route.children.length ? cloneRoutes(route.children) : [],
  }
  if (route.name !== undefined)
    clone.name = route.name
  if (route.modes)
    clone.modes = [...route.modes]
  if (route.meta) {
    clone.meta = { ...route.meta }
    if (route.meta.groups)
      clone.meta.groups = [...(route.meta.groups as string[])]
  }
  if (route.components)
    clone.components = { ...route.components }

  // Clone any extra attrs (e.g. mode, method)
  for (const key of Object.keys(route)) {
    if (!(key in clone)) {
      clone[key] = route[key]
    }
  }

  return clone
}

function optionsToKey(options?: VueRouterEmitOptions<Record<string, string[]>>): string {
  if (!options)
    return ''
  const parts: string[] = []
  if (options.getRouteName)
    parts.push('n')
  if (options.onDuplicateRouteName)
    parts.push('d')
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) {
      parts.push(`a:${k}=${v.join(',')}`)
    }
  }
  return parts.join('|')
}

/**
 * Convert a route tree to Vue Router 4 route definitions.
 *
 * Results are cached on the tree and deep-cloned on return, so mutations
 * to the returned array do not affect the cache. The cache is automatically
 * invalidated when `addFile` / `removeFile` mark the tree as dirty.
 */
export function toVueRouter4<const Attrs extends Record<string, string[]> = never>(
  tree: RouteTree,
  // eslint-disable-next-line ts/no-empty-object-type
  options?: VueRouterEmitOptions<[Attrs] extends [never] ? {} : Attrs>,
): VueRoute<[Attrs] extends [never] ? {} : Attrs>[] { // eslint-disable-line ts/no-empty-object-type
  const key = optionsToKey(options as VueRouterEmitOptions<Record<string, string[]>>)
  const cached = (tree as any)['~cachedVueRouter'] as CachedVueRouterResult | undefined

  if (!tree['~dirty'] && cached && cached.optionsKey === key) {
    return cloneRoutes(cached.routes) as VueRoute<any>[]
  }

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

  const result = prepareRoutes(routes, undefined, options as VueRouterEmitOptions<Record<string, string[]>>)

  // Cache on the tree
  ;(tree as any)['~cachedVueRouter'] = { routes: result, optionsKey: key } satisfies CachedVueRouterResult
  tree['~dirty'] = false

  return cloneRoutes(result) as VueRoute<any>[]
}

// --- rou3 --------------------------------------------------------------------

export function toRou3(tree: RouteTree): Rou3Route[] {
  return flattenTree(tree).map((info) => {
    let path = '/'
    for (const segment of info.segments) {
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
      let re = ''
      for (const token of segment) {
        const key = sanitizeCaptureGroup(token.value)
        switch (token.type) {
          case 'group':
            break
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
}

const INDEX_RE = /\/index$/
const SLASH_RE = /\//g

function defaultGetRouteName(rawName: string): string {
  return rawName.replace(INDEX_RE, '').replace(SLASH_RE, '-') || 'index'
}

function prepareRoutes(
  routes: IntermediateRoute[],
  parent?: IntermediateRoute,
  options?: VueRouterEmitOptions<Record<string, string[]>>,
  names = new Map<string, string>(),
): VueRoute[] {
  const getRouteName = options?.getRouteName || defaultGetRouteName
  const attrs = options?.attrs

  for (const route of routes) {
    route.scoreSegments = computeScoreSegments(route)
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

    // Collect modes from all sibling files
    const allModes = new Set<string>()
    for (const f of route.siblingFiles) {
      if (f.modes) {
        for (const m of f.modes) allModes.add(m)
      }
    }

    // Apply attrs: collapse modes into named attributes
    if (attrs && allModes.size > 0) {
      let modesConsumed = false
      for (const [attrName, attrValues] of Object.entries(attrs)) {
        const matched = attrValues.filter(v => allModes.has(v))
        if (matched.length === 1) {
          out[attrName] = matched[0]
          modesConsumed = true
        }
      }
      // Only emit `modes` if not fully consumed by attrs
      if (!modesConsumed)
        out.modes = [...allModes]
    }
    else if (allModes.size > 0) {
      out.modes = [...allModes]
    }

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
