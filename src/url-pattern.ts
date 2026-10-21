/**
 * Convert rou3 / Nitro route patterns into URLPattern pathname syntax.
 *
 * rou3 aligns its syntax with URLPattern, so most tokens (`:name`,
 * `:name(regex)`, `:name?`, `:name+`, `:name*`, `*`, `(regex)`, `{...}`) mean
 * the same thing in both and are passed through unchanged. Only rou3's `**`
 * (and `**:name`) catch-all has no URLPattern equivalent and becomes `*`.
 * Patterns written for rou3 0.x or radix3, where `*` matches a single
 * segment, need `wildcard: 'segment'`.
 *
 * The resulting strings are URLPattern pathname patterns, so they can be
 * dropped straight into a Speculation Rules `href_matches` rule or passed to
 * `new URLPattern({ pathname })`.
 */

export interface Rou3ToURLPatternIssue {
  /**
   * `widened`: the emitted pattern matches more than the rou3 route did, i.e.
   * a single-segment token mapped to `*` (which crosses `/`) under
   * `segment: 'loose'`.
   */
  type: 'widened'
  /** The param name involved, if the issue concerns a single param. */
  param?: string
  message: string
}

export interface Rou3PatternToURLPatternOptions {
  /**
   * How to translate a single-segment token (rou3 `:name` or `(regex)`).
   *
   * - `'strict'` (default): pass it through unchanged, preserving rou3's
   *   segment-scoped semantics.
   * - `'loose'`: map to URLPattern `*`, matching Nuxt's historical inline
   *   conversion. This over-matches (a single `*` will also match nested
   *   paths) and is reported as a `widened` issue, but produces shorter
   *   patterns.
   */
  segment?: 'strict' | 'loose'

  /**
   * What a bare `*` in the input matches.
   *
   * - `'rest'` (default): the rest of the path, `/` included, as in rou3 1.x.
   *   It is passed through unchanged.
   * - `'segment'`: a single segment, as in rou3 0.x and radix3 (Nitro v2).
   *   It becomes `([^\/]*)`, or `*` with a `widened` issue under
   *   `segment: 'loose'`.
   */
  wildcard?: 'rest' | 'segment'
}

export interface Rou3PatternToURLPatternResult {
  /** The converted URLPattern pathname pattern. */
  pattern: string
  /** One entry per lossy or widening conversion step; empty when faithful. */
  issues: Rou3ToURLPatternIssue[]
}

/**
 * Convert a single rou3 route pattern into a URLPattern pathname pattern.
 *
 * URLPattern-compatible tokens (named params, constrained params, modifiers,
 * groups, `*`) are passed through unchanged; only `**` is translated (see the
 * module doc comment). Backslash-escaped characters are left as-is.
 *
 * Any widening step is recorded in `issues` (see {@link Rou3ToURLPatternIssue}),
 * so callers can surface risky conversions to their users rather than silently
 * emitting a broader matcher.
 *
 * @example
 * rou3PatternToURLPattern('/blog/**').pattern // => '/blog/*'
 * rou3PatternToURLPattern('/users/:id').pattern // => '/users/:id'
 * rou3PatternToURLPattern('/users/:id', { segment: 'loose' }).pattern // => '/users/*'
 */
export function rou3PatternToURLPattern(
  pattern: string,
  options?: Rou3PatternToURLPatternOptions,
): Rou3PatternToURLPatternResult {
  const issues: Rou3ToURLPatternIssue[] = []
  const converted = convert(pattern, {
    loose: options?.segment === 'loose',
    segmentWildcard: options?.wildcard === 'segment',
  }, issue => issues.push(issue))
  return { pattern: converted, issues }
}

interface ConvertOptions {
  loose: boolean
  segmentWildcard: boolean
}

const WORD_RE = /\w/
const CATCH_ALL_GROUP = '(.*)'

function isModifier(char: string | undefined): boolean {
  return char === '?' || char === '+' || char === '*'
}

function convert(pattern: string, options: ConvertOptions, report: (issue: Rou3ToURLPatternIssue) => void): string {
  return splitRou3Segments(pattern)
    .map(segment => convertSegment(segment, pattern, options, report))
    .join('/')
}

function convertSegment(
  segment: string,
  pattern: string,
  { loose, segmentWildcard }: ConvertOptions,
  report: (issue: Rou3ToURLPatternIssue) => void,
): string {
  let out = ''
  let i = 0
  while (i < segment.length) {
    const char = segment[i]

    if (char === '\\') {
      out += char + (segment[i + 1] ?? '')
      i += 2
      continue
    }

    if (char === '*') {
      i++
      if (segment[i] === '*') {
        i++
        if (segment[i] === ':') {
          i++
          while (i < segment.length && WORD_RE.test(segment[i])) i++
        }
      }
      else if (segmentWildcard && !loose) {
        out += '([^\\/]*)'
        continue
      }
      else if (segmentWildcard) {
        report({ type: 'widened', message: `Widened \`*\` in "${pattern}" to \`*\`, which matches across \`/\`` })
      }
      out += '*'
      continue
    }

    if (char === ':') {
      const start = i
      i++
      let name = ''
      while (i < segment.length && WORD_RE.test(segment[i])) {
        name += segment[i]
        i++
      }
      const groupStart = i
      if (segment[i] === '(')
        i = skipGroup(segment, i)
      const catchAll = segment.slice(groupStart, i) === CATCH_ALL_GROUP
      if (isModifier(segment[i]))
        i++

      if (loose && !catchAll) {
        report({ type: 'widened', param: name, message: `Widened ":${name}" in "${pattern}" to \`*\`, which matches across \`/\`` })
        out += '*'
      }
      else {
        out += segment.slice(start, i)
      }
      continue
    }

    if (char === '(') {
      const start = i
      i = skipGroup(segment, i)
      const catchAll = segment.slice(start, i) === CATCH_ALL_GROUP
      if (isModifier(segment[i]))
        i++
      if (loose && !catchAll) {
        report({ type: 'widened', message: `Widened unnamed group in "${pattern}" to \`*\`, which matches across \`/\`` })
        out += '*'
      }
      else {
        out += segment.slice(start, i)
      }
      continue
    }

    if (char === '{') {
      const start = i
      while (i < segment.length && segment[i] !== '}') {
        if (segment[i] === '\\')
          i++
        i++
      }
      i++
      if (isModifier(segment[i]))
        i++
      out += segment.slice(start, i)
      continue
    }

    out += char
    i++
  }
  return out
}

/** Split a rou3 pattern on unescaped `/`. */
function splitRou3Segments(pattern: string): string[] {
  const segments: string[] = []
  let current = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\') {
      current += char + (pattern[i + 1] ?? '')
      i++
      continue
    }
    if (char === '/') {
      segments.push(current)
      current = ''
      continue
    }
    current += char
  }
  segments.push(current)
  return segments
}

/** Return the index just past a `(...)` group starting at `open`. */
function skipGroup(segment: string, open: number): number {
  let depth = 0
  let i = open
  while (i < segment.length) {
    const char = segment[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '(') {
      depth++
    }
    else if (char === ')') {
      depth--
      i++
      if (depth === 0)
        return i
      continue
    }
    i++
  }
  return i
}
