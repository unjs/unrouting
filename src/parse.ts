import escapeStringRegexp from 'escape-string-regexp'
import { withoutLeadingSlash, withoutTrailingSlash, withTrailingSlash } from 'ufo'

export interface ParsePathOptions {
  /**
   * File extensions to strip. If omitted, all extensions are stripped.
   */
  extensions?: string[]
  postfix?: string
  /** Warn about invalid characters in dynamic parameters. */
  warn?: (message: string) => void
  /**
   * Mode suffixes to detect (e.g. `['client', 'server']`).
   * Detected as `.mode` before the file extension.
   */
  modes?: string[]
  /** Root paths to strip from file paths. Longest match wins. */
  roots?: string[]
}

export type SegmentType = 'static' | 'dynamic' | 'optional' | 'catchall' | 'group' | 'repeatable' | 'optional-repeatable'

export interface ParsedPathSegmentToken {
  type: SegmentType
  value: string
}

export type ParsedPathSegment = ParsedPathSegmentToken[]

export interface ParsedPath {
  /** Original file path before processing. */
  file: string
  segments: ParsedPathSegment[]
  meta?: {
    /** Detected modes (e.g. `['client', 'vapor']`). */
    modes?: string[]
    /** Named view from `@name` suffix. */
    name?: string
  }
}

// --- parsePath ---------------------------------------------------------------

export function parsePath(filePaths: string[], options: ParsePathOptions = {}): ParsedPath[] {
  const EXT_RE = options.extensions
    ? new RegExp(`\\.(${options.extensions.map(ext => ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)
    : /\.\w+$/

  const sortedRoots = [...options.roots || []].sort((a, b) => b.length - a.length)
  const PREFIX_RE = sortedRoots.length > 0
    ? new RegExp(`^(?:${sortedRoots.map(root => escapeStringRegexp(withTrailingSlash(root))).join('|')})`)
    : undefined

  const supportedModes = options.modes || []
  const results: ParsedPath[] = []

  for (let filePath of filePaths) {
    const originalFilePath = filePath
    if (PREFIX_RE)
      filePath = filePath.replace(PREFIX_RE, '')
    filePath = filePath.replace(EXT_RE, '')

    // Named views: @name suffix
    let namedView: string | undefined
    const viewMatch = filePath.match(/@([\w-]+)(?:\.|$)/)
    if (viewMatch) {
      namedView = viewMatch[1]
      filePath = filePath.replace(/@[\w-]+/, '')
    }

    // Modes: extract from right to left (e.g. "file.client.vapor" → ['client', 'vapor'])
    const modes: string[] = []
    let scanning = true
    while (scanning) {
      scanning = false
      for (const mode of supportedModes) {
        if (filePath.endsWith(`.${mode}`)) {
          modes.unshift(mode)
          filePath = filePath.slice(0, -(mode.length + 1))
          scanning = true
          break
        }
      }
    }

    // withoutTrailingSlash('') returns '/', withoutLeadingSlash('/') returns '/'
    const normalized = withoutLeadingSlash(withoutTrailingSlash(filePath))
    const segments = normalized === '/' ? [''] : normalized.split('/')

    const meta: ParsedPath['meta'] = {}
    if (modes.length > 0)
      meta.modes = modes
    if (namedView)
      meta.name = namedView

    results.push({
      file: originalFilePath,
      segments: segments.map(s => parseSegment(s, originalFilePath, options.warn)),
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    })
  }

  return results
}

// --- parseSegment ------------------------------------------------------------

const PARAM_CHAR_RE = /[\w.]/

export function parseSegment(segment: string, absolutePath?: string, warn?: (message: string) => void): ParsedPathSegmentToken[] {
  if (segment === '')
    return [{ type: 'static', value: '' }]

  type State = 'initial' | SegmentType
  let state: State = 'initial'
  let i = 0
  let buffer = ''
  const tokens: ParsedPathSegmentToken[] = []

  function flush(type: SegmentType) {
    tokens.push({ type, value: buffer })
    buffer = ''
  }

  while (i < segment.length) {
    const c = segment[i]

    switch (state) {
      case 'initial':
        buffer = ''
        if (c === '[') {
          state = 'dynamic'
        }
        else if (c === '(') {
          state = 'group'
        }
        else {
          i--
          state = 'static'
        }
        break

      case 'static':
        if (c === '[') {
          flush(state)
          state = 'dynamic'
        }
        else if (c === '(') {
          flush(state)
          state = 'group'
        }
        else {
          buffer += c
        }
        break

      case 'catchall':
      case 'dynamic':
      case 'optional':
      case 'group':
        if (buffer === '...') {
          buffer = ''
          state = 'catchall'
        }
        if (c === '[' && state === 'dynamic')
          state = 'optional'

        if (c === ']' && (state !== 'optional' || segment[i - 1] === ']')) {
          if (!buffer)
            throw new Error('Empty param')

          if (segment[i + 1] === '+') {
            tokens.push({
              type: state === 'optional' ? 'optional-repeatable' : 'repeatable',
              value: buffer,
            })
            buffer = ''
            i++
          }
          else {
            flush(state)
          }
          state = 'initial'
        }
        else if (c === ')' && state === 'group') {
          if (!buffer)
            throw new Error('Empty group')
          flush(state)
          state = 'initial'
        }
        else if (c && PARAM_CHAR_RE.test(c)) {
          buffer += c
        }
        else if ((state === 'dynamic' || state === 'optional') && c !== '[' && c !== ']') {
          warn?.(`'${c}' is not allowed in a dynamic route parameter and has been ignored. Consider renaming '${absolutePath}'.`)
        }
        break
    }
    i++
  }

  if (state === 'dynamic')
    throw new Error(`Unfinished param "${buffer}"`)
  if (state === 'group')
    throw new Error(`Unfinished group "${buffer}"`)
  if (state !== 'initial' && buffer)
    flush(state)

  // Normalize index → empty static
  if (tokens.length === 1 && tokens[0].type === 'static' && tokens[0].value === 'index')
    tokens[0].value = ''

  return tokens
}
