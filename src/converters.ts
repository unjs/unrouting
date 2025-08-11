import type { ParsedPath, ParsedPathSegment } from './parse'

import escapeStringRegexp from 'escape-string-regexp'
import { encodePath, joinURL } from 'ufo'
import { parsePath } from './parse'

/**
 * - [x] support exporting to pure RegExp matcher
 * - [x] support exporting to rou3/Nitro routes
 * - [ ] support exporting to `vue-router` routes
 *       with compatibility for [Nuxt](https://github.com/nuxt/nuxt) and
 *       [unplugin-vue-router](https://github.com/posva/unplugin-vue-router)
 * - [ ] support exporting to SolidStart
 * - [ ] support exporting to SvelteKit routes
 */

/**
 * Convert file path to rou3 route pattern format.
 */
export function toRou3(filePaths: string[] | ParsedPath[]) {
  const routes: string[] = []
  for (const filePath of filePaths) {
    const segments = typeof filePath === 'string' ? parsePath([filePath])[0].segments : filePath.segments

    let route = '/'

    for (const segment of segments) {
      if (segment.every(token => token.type === 'group'))
        continue

      let rou3Segment = ''
      for (const token of segment) {
        if (token.type === 'static')
          rou3Segment += token.value

        if (token.type === 'dynamic')
          rou3Segment += token.value ? `:${token.value}` : '*'

        if (token.type === 'optional')
          throw new TypeError('[unrouting] `toRou3` does not support optional parameters')

        if (token.type === 'repeatable')
          throw new TypeError('[unrouting] `toRou3` does not support repeatable parameters')

        if (token.type === 'optional-repeatable')
          throw new TypeError('[unrouting] `toRou3` does not support optional repeatable parameters')

        if (token.type === 'catchall')
          rou3Segment += token.value ? `**:${token.value}` : '**'
      }

      // If a segment has value '' we skip adding it entirely
      if (rou3Segment)
        route = joinURL(route, rou3Segment)
    }

    routes.push(route)
  }

  return routes
}

function generatePathSegment(segment: ParsedPathSegment, hasSucceedingSegment: boolean) {
  let pathSegment = ''
  for (const token of segment) {
    if (token.type === 'group')
      continue
    if (token.type === 'static') {
      pathSegment += encodePath(token.value).replace(/:/g, '\\:')
      continue
    }
    if (token.type === 'dynamic') {
      pathSegment += `:${token.value}()`
      continue
    }
    if (token.type === 'optional') {
      pathSegment += `:${token.value}?`
      continue
    }
    if (token.type === 'repeatable') {
      pathSegment += `:${token.value}+`
      continue
    }
    if (token.type === 'optional-repeatable') {
      pathSegment += `:${token.value}*`
      continue
    }
    if (token.type === 'catchall') {
      pathSegment += hasSucceedingSegment ? `:${token.value}([^/]*)*` : `:${token.value}(.*)*`
      continue
    }
  }
  return pathSegment
}

export function toVueRouter4(filePaths: string[] | ParsedPath[]) {
  const routes: Array<{ path: string }> = []

  for (const filePath of filePaths) {
    const segments = typeof filePath === 'string' ? parsePath([filePath])[0].segments : filePath.segments

    let path = '/'

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]

      // Skip group-only segments as they don't contribute to the URL path
      if (segment.every(token => token.type === 'group'))
        continue

      const hasSucceedingSegment = i < segments.length - 1
      const pathSegment = generatePathSegment(segment, hasSucceedingSegment)

      // Only join if pathSegment is not empty
      if (pathSegment)
        path = joinURL(path, pathSegment)
    }

    routes.push({
      path,
    })
  }

  return routes
}

function sanitizeCaptureGroup(captureGroup: string) {
  return captureGroup.replace(/^(\d)/, '_$1').replace(/\./g, '')
}
export function toRegExp(filePaths: string[] | ParsedPath[]) {
  const routes: Array<{ pattern: RegExp, keys: string[] }> = []
  for (const filePath of filePaths) {
    const segments = typeof filePath === 'string' ? parsePath([filePath])[0].segments : filePath.segments

    const keys: string[] = []
    let sourceRE = '^'

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]

      if (segment.every(token => token.type === 'group'))
        continue

      let reSegment = ''
      for (const token of segment) {
        if (token.type === 'static')
          reSegment += escapeStringRegexp(token.value)

        if (token.type === 'dynamic') {
          const key = sanitizeCaptureGroup(token.value)
          keys.push(key)
          reSegment += `(?<${key}>[^/]+)`
        }

        if (token.type === 'optional') {
          const key = sanitizeCaptureGroup(token.value)
          keys.push(key)
          reSegment += `(?<${key}>[^/]*)`
        }

        if (token.type === 'repeatable') {
          const key = sanitizeCaptureGroup(token.value)
          keys.push(key)
          reSegment += `(?<${key}>[^/]+(?:/[^/]+)*)`
        }

        if (token.type === 'optional-repeatable') {
          const key = sanitizeCaptureGroup(token.value)
          keys.push(key)
          reSegment += `(?<${key}>[^/]*(?:/[^/]+)*)`
        }

        if (token.type === 'catchall') {
          const key = sanitizeCaptureGroup(token.value)
          keys.push(key)
          reSegment += `(?<${key}>.*)`
        }
      }

      // Check if the entire segment is optional (contains only optional, catchall, or optional-repeatable tokens, or groups)
      const isOptionalSegment = segment.every(token =>
        token.type === 'optional'
        || token.type === 'catchall'
        || token.type === 'group'
        || token.type === 'optional-repeatable',
      )

      // Add slash and segment content
      if (reSegment) {
        if (isOptionalSegment)
          sourceRE += `(?:\\/${reSegment})?`
        else
          sourceRE += `\\/${reSegment}`
      }
    }

    // Add optional trailing slash and end anchor
    sourceRE += '\\/?$'

    routes.push({
      pattern: new RegExp(sourceRE),
      keys,
    })
  }

  return routes
}
