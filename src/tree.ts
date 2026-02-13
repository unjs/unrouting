import type { CompiledParsePath, ParsedPath, ParsedPathSegment, ParsePathOptions } from './parse'
import { parsePath } from './parse'

// --- Types -------------------------------------------------------------------

export interface RouteNodeFile {
  /** Original file path (before root stripping / extension removal) */
  'path': string
  /** Relative path reconstructed from parsed segments (for sorting) */
  'relativePath': string
  /** Named view slot (`'default'` unless `@name` suffix was used) */
  'viewName': string
  /** Mode variants (e.g. `['client']`, `['server']`) */
  'modes'?: string[]
  /** Route group names from transparent group segments */
  'groups': string[]
  /** Original parsed segments (including groups) */
  'originalSegments': ParsedPathSegment[]
  /** Layer priority — lower number wins. @default 0 */
  'priority': number
  /**
   * Precomputed key for duplicate detection
   * @internal
   */
  '~dedupeKey'?: string
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
  'root': RouteNode
  /**
   * Whether the tree has been modified since the last converter output.
   * Set to `true` by `addFile` / `removeFile` / `buildTree`.
   * Converters (e.g. `toVueRouter4`) can set this to `false` after caching.
   * @internal
   */
  '~dirty': boolean
  /**
   * Index from file path to the node that contains it.
   * Enables O(1) lookup for `removeFile`.
   * @internal
   */
  '~fileIndex': Map<string, RouteNode>
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
  const fileIndex = new Map<string, RouteNode>()

  if (input.length === 0)
    return { root, '~dirty': true, '~fileIndex': fileIndex }

  if (isParsedPaths(input)) {
    for (const p of input)
      insertParsedPath(root, p, 0, options, fileIndex)
  }
  else if (isInputFiles(input)) {
    const paths = input.map(f => f.path)
    const priorities = input.map(f => f.priority ?? 0)
    const parsed = parsePath(paths, options)
    for (let i = 0; i < parsed.length; i++)
      insertParsedPath(root, parsed[i], priorities[i], options, fileIndex)
  }
  else {
    const parsed = parsePath(input as string[], options)
    for (const p of parsed)
      insertParsedPath(root, p, 0, options, fileIndex)
  }

  return { root, '~dirty': true, '~fileIndex': fileIndex }
}

function isParsedPaths(input: unknown[]): input is ParsedPath[] {
  const first = input[0]
  return !!first && typeof first === 'object' && 'segments' in first
}

function isInputFiles(input: unknown[]): input is InputFile[] {
  const first = input[0]
  return !!first && typeof first === 'object' && 'path' in first && !('segments' in first)
}

function insertParsedPath(root: RouteNode, parsedPath: ParsedPath, priority: number, options: BuildTreeOptions, fileIndex?: Map<string, RouteNode>): void {
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
  const dedupeKey = `${viewName}\0${groupKey}\0${modesKey}`

  const fileEntry: RouteNodeFile = {
    'path': parsedPath.file,
    'relativePath': reconstructRelativePath(parsedPath),
    viewName,
    modes,
    'groups': [...groups],
    'originalSegments': parsedPath.segments,
    priority,
    '~dedupeKey': dedupeKey,
  }

  // Two files are duplicates when they share the same view, modes, and groups.
  const existing = current.files.find(f => f['~dedupeKey'] === dedupeKey)

  if (!existing) {
    current.files.push(fileEntry)
    fileIndex?.set(parsedPath.file, current)
    return
  }

  const strategy = options.duplicateStrategy || 'first-wins'
  if (strategy === 'error')
    throw new Error(`Duplicate route file for view "${viewName}": "${existing.path}" and "${parsedPath.file}"`)

  const idx = current.files.indexOf(existing)
  if (strategy === 'last-wins' || priority < existing.priority) {
    fileIndex?.delete(existing.path)
    current.files[idx] = fileEntry
    fileIndex?.set(parsedPath.file, current)
  }
}

// --- Incremental updates -----------------------------------------------------

/**
 * Add a single file to an existing route tree.
 *
 * Parses the file path and inserts it into the tree in-place, avoiding a full
 * rebuild. Useful for dev-server HMR when a file is added or renamed.
 *
 * The `options` parameter accepts either raw `BuildTreeOptions` or a
 * pre-compiled `CompiledParsePath` (from `compileParsePath()`) for faster
 * repeated calls.
 */
export function addFile(
  tree: RouteTree,
  filePath: string | InputFile,
  options: BuildTreeOptions | CompiledParsePath = {},
): void {
  const path = typeof filePath === 'string' ? filePath : filePath.path
  const priority = typeof filePath === 'string' ? 0 : (filePath.priority ?? 0)
  const parseOne = isCompiledParsePath(options) ? options : parsePath
  const parseOpts = isCompiledParsePath(options) ? undefined : options
  const [parsed] = parseOne([path], parseOpts as any)
  insertParsedPath(tree.root, parsed, priority, (isCompiledParsePath(options) ? {} : options) as BuildTreeOptions, tree['~fileIndex'])
  tree['~dirty'] = true
}

/**
 * Remove a file from an existing route tree by its original file path.
 *
 * Prunes empty structural nodes left behind. Returns `true` if the file was
 * found and removed.
 */
export function removeFile(tree: RouteTree, filePath: string): boolean {
  // Fast path: use file index if available
  const node = tree['~fileIndex']?.get(filePath)
  if (node) {
    const idx = node.files.findIndex(f => f.path === filePath)
    if (idx !== -1) {
      node.files.splice(idx, 1)
      tree['~fileIndex'].delete(filePath)
      pruneEmptyAncestors(node)
      tree['~dirty'] = true
      return true
    }
  }

  // Fallback: DFS search (for trees built without index)
  const removed = removeFromNode(tree.root, filePath)
  if (removed)
    tree['~dirty'] = true
  return removed
}

function removeFromNode(node: RouteNode, filePath: string): boolean {
  // Check files on this node
  const idx = node.files.findIndex(f => f.path === filePath)
  if (idx !== -1) {
    node.files.splice(idx, 1)
    pruneEmptyAncestors(node)
    return true
  }

  // Recurse into children
  for (const child of node.children.values()) {
    if (removeFromNode(child, filePath))
      return true
  }

  return false
}

function pruneEmptyAncestors(node: RouteNode): void {
  // Walk up from the node, removing any that have no files and no children
  let current: RouteNode | null = node
  while (current && current.parent) {
    if (current.files.length === 0 && current.children.size === 0) {
      current.parent.children.delete(current.rawSegment)
      current = current.parent
    }
    else {
      break
    }
  }
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

function isCompiledParsePath(options: any): options is CompiledParsePath {
  return typeof options === 'function' && options['~compiled'] === true
}

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
