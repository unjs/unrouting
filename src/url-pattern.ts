/**
 * Convert rou3 / Nitro route patterns into URLPattern pathname syntax.
 *
 * rou3 describes its own syntax as "URLPattern-compatible", but the two
 * disagree on a few tokens, so the conversion is not a no-op:
 *
 * - rou3 `*` is a single-segment wildcard (`[^/]*`, does not cross `/`).
 * - URLPattern `*` is a greedy catch-all (`.*`, crosses `/`).
 * - rou3 `**` is a catch-all (zero or more segments); URLPattern treats `**`
 *   literally.
 *
 * See rou3's "Differences from URLPattern" table:
 * https://github.com/h3js/rou3#differences-from-urlpattern
 *
 * The resulting strings are URLPattern pathname patterns, so they can be
 * dropped straight into a Speculation Rules `href_matches` rule or passed to
 * `new URLPattern({ pathname })`.
 */

export interface Rou3ToURLPatternIssue {
  /**
   * - `widened`: the emitted pattern matches more than the rou3 route did,
   *   e.g. a single-segment token mapped to `*` (which crosses `/`) under
   *   `segment: 'loose'`, or a repeatable param.
   * - `unsupported`: the pattern contained rou3 syntax with no faithful
   *   URLPattern equivalent (a regexp constraint, unnamed group or
   *   non-capturing group); a best-effort, broader pattern was emitted.
   */
  type: 'widened' | 'unsupported'
  /** The param name involved, if the issue concerns a single param. */
  param?: string
  message: string
}

export interface Rou3PatternToURLPatternOptions {
  /**
   * How to translate a single-segment token (rou3 `:name` and bare `*`).
   *
   * - `'strict'` (default): map to `([^/]+)` / `([^/]*)` so the pattern does
   *   not match across `/`, preserving rou3's segment-scoped semantics.
   * - `'loose'`: map to URLPattern `*`, matching Nuxt's historical inline
   *   conversion. This over-matches (a single `*` will also match nested
   *   paths) and is reported as a `widened` issue, but produces shorter
   *   patterns.
   */
  segment?: 'strict' | 'loose'
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
 * Handles the segment kinds used by rou3 route rules: static segments, named
 * params (`:name`), single-segment wildcards (`*`), catch-alls (`**`) and
 * named catch-alls (`**:name`). Backslash-escaped characters are left as-is.
 *
 * Any lossy or widening step is recorded in `issues` (see
 * {@link Rou3ToURLPatternIssue}), so callers can surface risky conversions to
 * their users rather than silently emitting a broader matcher.
 *
 * @example
 * rou3PatternToURLPattern('/blog/**').pattern // => '/blog/*'
 * rou3PatternToURLPattern('/users/:id').pattern // => '/users/([^/]+)'
 * rou3PatternToURLPattern('/users/:id', { segment: 'loose' }).pattern // => '/users/*'
 */
export function rou3PatternToURLPattern(
  pattern: string,
  options?: Rou3PatternToURLPatternOptions,
): Rou3PatternToURLPatternResult {
  const issues: Rou3ToURLPatternIssue[] = []
  const converted = convert(pattern, options?.segment === 'loose', issue => issues.push(issue))
  return { pattern: converted, issues }
}

const WORD_RE = /\w/

function convert(pattern: string, loose: boolean, report: (issue: Rou3ToURLPatternIssue) => void): string {
  const singleSegment = loose ? '*' : '([^/]+)'
  return splitRou3Segments(pattern)
    .map(segment => convertSegment(segment, pattern, loose, singleSegment, report))
    .join('/')
}

function convertSegment(
  segment: string,
  pattern: string,
  loose: boolean,
  singleSegment: string,
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
      if (segment[i + 1] === '*') {
        i += 2
        if (segment[i] === ':') {
          i++
          while (i < segment.length && WORD_RE.test(segment[i])) i++
        }
        out += '*'
        continue
      }
      if (loose)
        report({ type: 'widened', message: `Widened \`*\` in "${pattern}" to \`*\`, which matches across \`/\`` })
      out += loose ? '*' : '([^/]*)'
      i++
      continue
    }

    if (char === ':') {
      i++
      let name = ''
      while (i < segment.length && WORD_RE.test(segment[i])) {
        name += segment[i]
        i++
      }
      let constrained = false
      if (segment[i] === '(') {
        constrained = true
        i = skipGroup(segment, i)
      }
      const modifier = segment[i] === '?' || segment[i] === '+' || segment[i] === '*' ? segment[i++] : ''

      if (constrained)
        report({ type: 'unsupported', param: name, message: `Dropped regexp constraint on ":${name}" in "${pattern}"; rou3 constraints have no URLPattern equivalent here` })

      if (modifier === '+' || modifier === '*') {
        report({ type: 'widened', param: name, message: `Widened repeatable param ":${name}${modifier}" in "${pattern}" to \`*\`, which matches across \`/\`` })
        out += '*'
      }
      else if (modifier === '?') {
        if (loose)
          report({ type: 'widened', param: name, message: `Widened optional param ":${name}?" in "${pattern}" to \`*\`, which matches across \`/\`` })
        out += loose ? '*' : '([^/]+)?'
      }
      else {
        if (loose)
          report({ type: 'widened', param: name, message: `Widened ":${name}" in "${pattern}" to \`*\`, which matches across \`/\`` })
        out += singleSegment
      }
      continue
    }

    if (char === '(') {
      i = skipGroup(segment, i)
      if (segment[i] === '?' || segment[i] === '+' || segment[i] === '*')
        i++
      report({ type: 'unsupported', message: `Dropped unnamed group in "${pattern}"; rou3 groups have no URLPattern equivalent here` })
      out += loose ? '*' : '([^/]*)'
      continue
    }

    if (char === '{') {
      while (i < segment.length && segment[i] !== '}') i++
      i++
      if (segment[i] === '?' || segment[i] === '+' || segment[i] === '*')
        i++
      report({ type: 'unsupported', message: `Dropped non-capturing group in "${pattern}"; rou3 groups have no URLPattern equivalent here` })
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
