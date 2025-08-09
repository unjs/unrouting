import { withoutLeadingSlash, withoutTrailingSlash } from 'ufo'

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
}

export function parsePath(filePath: string, options: ParsePathOptions = {}): ParsedPath {
  // remove file extensions (allow-listed if `options.extensions` is specified)
  const EXT_RE = options.extensions ? new RegExp(`\\.(${options.extensions.join('|')})$`) : /\.\w+$/
  filePath = filePath.replace(EXT_RE, '')

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

  // add leading slash and remove trailing slash: test/ -> /test
  const segments = withoutLeadingSlash(withoutTrailingSlash(filePath)).split('/')

  return {
    segments: segments.map(s => parseSegment(s, filePath, options.warn)),
    modes: modes.length > 0 ? modes : undefined,
  }
}

const PARAM_CHAR_RE = /[\w.]/

export type SegmentType = 'static' | 'dynamic' | 'optional' | 'catchall' | 'group'
export interface ParsedPathSegmentToken { type: SegmentType, value: string }
export type ParsedPathSegment = Array<ParsedPathSegmentToken>
export interface ParsedPath {
  /**
   * The parsed segments of the file path
   */
  segments: ParsedPathSegment[]
  /**
   * The detected modes from the file path (e.g., ['client', 'vapor'])
   */
  modes?: string[]
}

export function parseSegment(segment: string, absolutePath?: string, warn?: (message: string) => void) {
  type SegmentParserState = 'initial' | SegmentType
  let state: SegmentParserState = 'initial'
  let i = 0

  let buffer = ''
  const tokens: ParsedPathSegmentToken[] = []

  function consumeBuffer() {
    if (!buffer)
      return
    if (state === 'initial')
      throw new Error('wrong state')

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
          consumeBuffer()
          state = 'dynamic'
        }
        else if (c === '(') {
          consumeBuffer()
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
          else
            consumeBuffer()

          state = 'initial'
        }
        else if (c === ')' && state === 'group') {
          if (!buffer)
            throw new Error('Empty group')
          else
            consumeBuffer()

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

  consumeBuffer()

  if (tokens.length === 1 && tokens[0].type === 'static' && tokens[0].value === 'index')
    tokens[0].value = ''

  return tokens
}
