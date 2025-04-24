import type { ParsedPath } from './parse'
import escapeStringRegexp from 'escape-string-regexp'

import { encodePath, joinURL } from 'ufo'
import { parsePath } from './parse'

/**
 * - [x] support exporting to pure RegExp matcher
 * - [x] support exporting to radix3/Nitro routes
 * - [ ] support exporting to `vue-router` routes
 *       with compatibility for [Nuxt](https://github.com/nuxt/nuxt) and
 *       [unplugin-vue-router](https://github.com/posva/unplugin-vue-router)
 * - [ ] support exporting to SolidStart
 * - [ ] support exporting to SvelteKit routes
 */

/**
 * TODO: need to implement protection logging + fall back to what radix3 supports.
 */
export function toRadix3(filePath: string | ParsedPath) {
  const segments = typeof filePath === 'string' ? parsePath(filePath) : filePath

  let route = '/'

  for (const segment of segments) {
    let radixSegment = ''
    for (const token of segment) {
      if (token.type === 'static')
        radixSegment += token.value

      if (token.type === 'dynamic')
        radixSegment += token.value ? `:${token.value}` : '*'

      if (token.type === 'optional')
        throw new TypeError('[unrouting] `toRadix3` does not support optional parameters')

      if (token.type === 'catchall')
        radixSegment += token.value ? `**:${token.value}` : '**'
    }

    // If a segment has value '' we skip adding it entirely
    if (route)
      route = joinURL(route, radixSegment)
  }

  return route
}

export function toVueRouter4(filePath: string | ParsedPath) {
  const segments = typeof filePath === 'string' ? parsePath(filePath) : filePath

  let path = '/'

  for (const segment of segments) {
    let pathSegment = ''
    for (const token of segment) {
      if (token.type === 'static') {
        pathSegment += encodePath(token.value).replace(/:/g, '\\:')
        continue
      }
      if (token.type === 'dynamic')
        pathSegment += `:${token.value}()`

      if (token.type === 'optional')
        pathSegment += `:${token.value}?`

      if (token.type === 'catchall')
        pathSegment += `:${token.value}(.*)*`
    }

    path = joinURL(path, pathSegment)
  }

  return {
    path,
  }
}

function sanitizeCaptureGroup(captureGroup: string) {
  return captureGroup.replace(/^(\d)/, '_$1').replace(/\./g, '')
}
export function toRegExp(filePath: string | ParsedPath) {
  const segments = typeof filePath === 'string' ? parsePath(filePath) : filePath

  let sourceRE = '\\/'

  for (const segment of segments) {
    let reSegment = ''
    for (const token of segment) {
      if (token.type === 'static')
        reSegment += escapeStringRegexp(token.value)

      if (token.type === 'dynamic')
        reSegment += `(?<${sanitizeCaptureGroup(token.value)}>[^/]+)`

      if (token.type === 'optional')
        reSegment += `(?<${sanitizeCaptureGroup(token.value)}>[^/]*)`

      if (token.type === 'catchall')
        reSegment += `(?<${sanitizeCaptureGroup(token.value)}>.*)`
    }

    if (segment.every(token => token.type === 'optional' || token.type === 'catchall')) {
      sourceRE += `(?:${reSegment}\\/?)`
    }
    else if (reSegment) {
      // If a segment has value '' we skip adding a trailing slash
      sourceRE += `${reSegment}\\/`
    }
  }

  // make final slash optional
  sourceRE += '?'

  return new RegExp(sourceRE)
}
