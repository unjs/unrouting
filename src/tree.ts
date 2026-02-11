import type { ParsedPath, ParsedPathSegment, ParsePathOptions } from './parse'
import { parsePath } from './parse'

// --- Types -------------------------------------------------------------------

export interface RouteNodeFile {
  /** Original file path (before root stripping / extension removal) */
  path: string
  /** Relative path reconstructed from parsed segments (for sorting) */
  relativePath: string
  /** Named view slot (`'default'` unless `@name` suffix was used) */
  viewName: string
  /** Mode variants (e.g. `['client']`, `['server']`) */
  modes?: string[]
  /** Route group names from transparent group segments */
  groups: string[]
  /** Original parsed segments (including groups) */
  originalSegments: ParsedPathSegment[]
  /** Layer priority — lower number wins. @default 0 */
  priority: number
}

/**
 * A node in the route tree.
 *
 * "Page nodes" have files; "structural nodes" don't.
 * Page nodes create nesting boundaries; structural nodes collapse into children.
 */
export interface RouteNode {
  rawSegment: string
  segment: ParsedPathSegment
  /** Attached files. Empty = structural node. */
  files: RouteNodeFile[]
  children: Map<string, RouteNode>
  parent: RouteNode | null
}

/** Input file with optional layer priority. */
export interface InputFile {
  path: string
  /** Layer priority — lower number wins. @default 0 */
  priority?: number
}

export interface BuildTreeOptions extends ParsePathOptions {
  /**
   * How to resolve duplicate files at the same tree position.
   *
   * - `'first-wins'` — keep existing unless the new file has strictly lower
   *   priority number. Equal priority keeps the first.
   * - `'last-wins'` — always replace with the later file.
   * - `'error'` — throw on duplicates.
   *
   * @default 'first-wins'
   */
  duplicateStrategy?: 'first-wins' | 'last-wins' | 'error'
}

export interface RouteTree {
  root: RouteNode
}

// --- Tree construction -------------------------------------------------------

function createNode(rawSegment: string, segment: ParsedPathSegment, parent: RouteNode | null): RouteNode {
  return { rawSegment, segment, files: [], children: new Map(), parent }
}

/**
 * Build a route tree from file paths.
 *
 * Accepts `string[]`, `InputFile[]`, or `ParsedPath[]`.
 * On collision, the file with the lowest priority number wins.
 */
export function buildTree(
  input: string[] | InputFile[] | ParsedPath[],
  options: BuildTreeOptions = {},
): RouteTree {
  const root = createNode('', [{ type: 'static', value: '' }], null)

  if (input.length === 0)
    return { root }

  if (isParsedPaths(input)) {
    for (const p of input)
      insertParsedPath(root, p, 0, options)
  }
  else if (isInputFiles(input)) {
    const paths = input.map(f => f.path)
    const priorities = input.map(f => f.priority ?? 0)
    const parsed = parsePath(paths, options)
    for (let i = 0; i < parsed.length; i++)
      insertParsedPath(root, parsed[i], priorities[i], options)
  }
  else {
    const parsed = parsePath(input as string[], options)
    for (const p of parsed)
      insertParsedPath(root, p, 0, options)
  }

  return { root }
}

function isParsedPaths(input: unknown[]): input is ParsedPath[] {
  const first = input[0]
  return !!first && typeof first === 'object' && 'segments' in first
}

function isInputFiles(input: unknown[]): input is InputFile[] {
  const first = input[0]
  return !!first && typeof first === 'object' && 'path' in first && !('segments' in first)
}

function insertParsedPath(root: RouteNode, parsedPath: ParsedPath, priority: number, options: BuildTreeOptions): void {
  let current = root
  const groups: string[] = []

  for (const segment of parsedPath.segments) {
    if (segment.every(token => token.type === 'group')) {
      for (const token of segment) groups.push(token.value)
      continue
    }
    const key = segmentToKey(segment)
    if (!current.children.has(key))
      current.children.set(key, createNode(key, segment, current))
    current = current.children.get(key)!
  }

  const viewName = parsedPath.meta?.name || 'default'
  const modes = parsedPath.meta?.modes
  const groupKey = groups.join(',')
  const modesKey = modes?.slice().sort().join(',') ?? ''

  const fileEntry: RouteNodeFile = {
    path: parsedPath.file,
    relativePath: reconstructRelativePath(parsedPath),
    viewName,
    modes,
    groups: [...groups],
    originalSegments: parsedPath.segments,
    priority,
  }

  // Two files are duplicates when they share the same view, modes, and groups.
  const existing = current.files.find((f) => {
    return f.viewName === viewName
      && f.groups.join(',') === groupKey
      && (f.modes?.slice().sort().join(',') ?? '') === modesKey
  })

  if (!existing) {
    current.files.push(fileEntry)
    return
  }

  const strategy = options.duplicateStrategy || 'first-wins'
  if (strategy === 'error')
    throw new Error(`Duplicate route file for view "${viewName}": "${existing.path}" and "${parsedPath.file}"`)

  const idx = current.files.indexOf(existing)
  if (strategy === 'last-wins' || priority < existing.priority)
    current.files[idx] = fileEntry
}

// --- Public utilities --------------------------------------------------------

/** Walk the tree depth-first, calling `visitor` for each non-root node. */
export function walkTree(tree: RouteTree, visitor: (node: RouteNode, depth: number, parent: RouteNode | null) => void): void {
  function walk(node: RouteNode, depth: number) {
    if (depth > 0)
      visitor(node, depth, node.parent)
    for (const child of node.children.values())
      walk(child, depth + 1)
  }
  walk(tree.root, 0)
}

/** True if the node has files attached (is a "page node"). */
export function isPageNode(node: RouteNode): boolean {
  return node.files.length > 0
}

// --- Internal helpers --------------------------------------------------------

function tokenToString(token: { type: string, value: string }): string {
  switch (token.type) {
    case 'static': return token.value
    case 'dynamic': return `[${token.value}]`
    case 'optional': return `[[${token.value}]]`
    case 'catchall': return `[...${token.value}]`
    case 'repeatable': return `[${token.value}]+`
    case 'optional-repeatable': return `[[${token.value}]]+`
    case 'group': return `(${token.value})`
    default: return token.value
  }
}

function segmentToKey(segment: ParsedPathSegment): string {
  return segment.map(tokenToString).join('')
}

function reconstructRelativePath(parsedPath: ParsedPath): string {
  const ext = parsedPath.file.match(/\.[^./]+$/)?.[0] || ''
  const path = parsedPath.segments.map(seg =>
    seg.map(t => t.type === 'static' && t.value === '' ? 'index' : tokenToString(t)).join(''),
  ).join('/')
  return path + ext
}
