import escapeStringRegexp from 'escape-string-regexp'
import { withoutLeadingSlash, withoutTrailingSlash, withTrailingSlash } from 'ufo'

/**
 * File system formats supported
 * - vue-router/nuxt 3 styles
 * - nitro style routes
 * - Next.js style
 * - sveltekit style
 * - solid start style
 */

export interface ParsePathOptions {
  /**
   * By default the extension of the file is stripped. To disable this behaviour, pass
   * an array of extensions to strip. The rest will be preserved.
   */
  extensions?: string[]
  postfix?: string
  /**
   * Warn about invalid characters in dynamic parameters
   */
  warn?: (message: string) => void
  /**
   * List of mode extensions to detect (e.g., ['client', 'server', 'vapor'])
   * These will be detected as `.mode` suffixes before the file extension
   * If not provided, no mode detection will be performed
   */
  modes?: string[]
  /**
   * Array of root paths to strip from the beginning of file paths.
   * Most specific (longest matching) root gets stripped first.
   */
  roots?: string[]
}

export function parsePath(filePaths: string[], options: ParsePathOptions = {}): ParsedPath[] {
  // remove file extensions (allow-listed if `options.extensions` is specified)
  const EXT_RE = options.extensions
    ? new RegExp(`\\.(${options.extensions.map(ext => ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)
    : /\.\w+$/

  const sortedRoots = [...options.roots || []].sort((a, b) => b.length - a.length)
  const PREFIX_RE = sortedRoots.length > 0
    ? new RegExp(`^(?:${sortedRoots.map(root => escapeStringRegexp(withTrailingSlash(root))).join('|')})`)
    : undefined

  const parsedPaths: ParsedPath[] = []

  for (let filePath of filePaths) {
    const originalFilePath = filePath
    if (PREFIX_RE) {
      filePath = filePath.replace(PREFIX_RE, '')
    }
    filePath = filePath.replace(EXT_RE, '')

    // detect named views (@ suffix before modes/extensions)
    let namedView: string | undefined
    const namedViewMatch = filePath.match(/@([\w-]+)(?:\.|$)/)
    if (namedViewMatch) {
      namedView = namedViewMatch[1]
      filePath = filePath.replace(/@[\w-]+/, '')
    }

    // detect modes
    const modes: string[] = []
    const supportedModes = options.modes || [] // no default modes

    // Extract modes from right to left to handle multiple modes like "file.client.vapor"
    let remainingPath = filePath
    let foundMode = true

    while (foundMode) {
      foundMode = false
      for (const mode of supportedModes) {
        const modePattern = new RegExp(`\\.${mode}$`)
        if (modePattern.test(remainingPath)) {
          modes.unshift(mode) // Add to front to maintain left-to-right order
          remainingPath = remainingPath.replace(modePattern, '')
          foundMode = true
          break
        }
      }
    }

    filePath = remainingPath

    // normalize: strip leading/trailing slashes so "test/" → "test", "/" → ""
    // Note: withoutTrailingSlash('') returns '/' and withoutLeadingSlash('/') returns '/'
    // so empty paths (e.g., root-only files) result in normalizedPath === '/'
    const normalizedPath = withoutLeadingSlash(withoutTrailingSlash(filePath))
    const segments = normalizedPath === '/' ? [''] : normalizedPath.split('/')

    const meta: { modes?: string[], name?: string } = {}
    if (modes.length > 0)
      meta.modes = modes
    if (namedView)
      meta.name = namedView

    parsedPaths.push({
      file: originalFilePath,
      segments: segments.map(s => parseSegment(s, originalFilePath, options.warn)),
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    })
  }

  return parsedPaths
}

const PARAM_CHAR_RE = /[\w.]/

export type SegmentType = 'static' | 'dynamic' | 'optional' | 'catchall' | 'group' | 'repeatable' | 'optional-repeatable'
export interface ParsedPathSegmentToken { type: SegmentType, value: string }
export type ParsedPathSegment = Array<ParsedPathSegmentToken>
export interface ParsedPath {
  /**
   * The full file path before processing
   */
  file: string
  /**
   * The parsed segments of the file path
   */
  segments: ParsedPathSegment[]
  /**
   * Metadata about the parsed path including modes and named view
   */
  meta?: {
    /**
     * The detected modes from the file path (e.g., ['client', 'vapor'])
     */
    modes?: string[]
    /**
     * The named view if the file has an @name suffix
     */
    name?: string
  }
}

export function parseSegment(segment: string, absolutePath?: string, warn?: (message: string) => void) {
  // Handle empty segment case - should return a single static token with empty value
  if (segment === '') {
    return [{ type: 'static' as SegmentType, value: '' }]
  }

  type SegmentParserState = 'initial' | SegmentType
  let state: SegmentParserState = 'initial'
  let i = 0

  let buffer = ''
  const tokens: ParsedPathSegmentToken[] = []

  function consumeBuffer(state: Exclude<SegmentType, 'initial'>) {
    tokens.push({
      type: state,
      value: buffer,
    })

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
          consumeBuffer(state)
          state = 'dynamic'
        }
        else if (c === '(') {
          consumeBuffer(state)
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

          // Check for + modifier after closing bracket
          if (segment[i + 1] === '+') {
            if (state === 'optional') {
              // [[param]]+ -> optional-repeatable
              tokens.push({
                type: 'optional-repeatable',
                value: buffer,
              })
            }
            else {
              // [param]+ -> repeatable
              tokens.push({
                type: 'repeatable',
                value: buffer,
              })
            }
            buffer = ''
            i++ // skip the + character
          }
          else {
            consumeBuffer(state)
          }

          state = 'initial'
        }
        else if (c === ')' && state === 'group') {
          if (!buffer)
            throw new Error('Empty group')
          else
            consumeBuffer(state)

          state = 'initial'
        }
        else if (c && PARAM_CHAR_RE.test(c)) {
          buffer += c
        }
        else if (state === 'dynamic' || state === 'optional') {
          if (c !== '[' && c !== ']')
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

  if (state !== 'initial' && buffer) {
    consumeBuffer(state)
  }

  if (tokens.length === 1 && tokens[0].type === 'static' && tokens[0].value === 'index')
    tokens[0].value = ''

  return tokens
}
