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
}

export function parsePath(filePath: string, options: ParsePathOptions = {}): ParsedPath {
  // remove file extensions (allow-listed if `options.extensions` is specified)
  const EXT_RE = options.extensions ? new RegExp(`\\.(${options.extensions.join('|')})$`) : /\.\w+$/
  filePath = filePath.replace(EXT_RE, '')

  // add leading slash and remove trailing slash: test/ -> /test
  const segments = withoutLeadingSlash(withoutTrailingSlash(filePath)).split('/')

  return segments.map(s => parseSegment(s))
}

const PARAM_CHAR_RE = /[\w\d_.]/

export type SegmentType = 'static' | 'dynamic' | 'optional' | 'catchall'
export interface ParsedPathSegmentToken { type: SegmentType, value: string }
export type ParsedPathSegment = Array<ParsedPathSegmentToken>
export type ParsedPath = ParsedPathSegment[]

export function parseSegment(segment: string) {
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
        else {
          buffer += c
        }
        break

      case 'catchall':
      case 'dynamic':
      case 'optional':
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
        else if (PARAM_CHAR_RE.test(c)) {
          buffer += c
        }
        break
    }
    i++
  }

  if (state === 'dynamic')
    throw new Error(`Unfinished param "${buffer}"`)

  consumeBuffer()

  if (tokens.length === 1 && tokens[0].type === 'static' && tokens[0].value === 'index')
    tokens[0].value = ''

  return tokens
}
