import type { ParsedPath, ParsedPathSegment, ParsePathOptions } from './parse'
import { parsePath } from './parse'

// ============================================================================
// Types
// ============================================================================

/**
 * A file contributing to a route node.
 * Supports named views, mode variants, per-file group tracking, and layer priority.
 */
export interface RouteNodeFile {
  /** Original file path (before root stripping / extension removal) */
  path: string
  /** Relative path reconstructed from parsed segments (for sorting) */
  relativePath: string
  /** Named view slot (default: 'default') */
  viewName: string
  /** Mode(s) this file handles (e.g., ['client'], ['server']) */
  modes?: string[]
  /** Route group names accumulated from transparent group segments in this file's path */
  groups: string[]
  /** Original parsed segments (including groups) from the parsed path */
  originalSegments: ParsedPathSegment[]
  /**
   * Layer priority. Lower number = higher priority.
   * When two files collide at the same tree position (same view, groups, modes),
   * the one with the lower priority number wins.
   * @default 0
   */
  priority: number
}

/**
 * A node in the route tree.
 *
 * Nodes are either "page nodes" (have files) or "structural nodes" (directory-only).
 * This distinction drives nesting behavior during emission:
 * - Page nodes create nesting boundaries (children get relative paths)
 * - Structural nodes collapse (their path segment is prepended to children)
 */
export interface RouteNode {
  /** The raw segment string (e.g., 'parent', '[slug]', '[[foo]]') */
  rawSegment: string
  /** Parsed segment tokens */
  segment: ParsedPathSegment
  /** Files contributing to this node. Empty array = structural node */
  files: RouteNodeFile[]
  /** Child nodes keyed by raw segment string */
  children: Map<string, RouteNode>
  /** Parent reference */
  parent: RouteNode | null
}

/**
 * Input file descriptor. Used when you need to specify priority per file.
 */
export interface InputFile {
  /** File path (will be parsed according to BuildTreeOptions) */
  path: string
  /**
   * Layer priority. Lower number = higher priority.
   * When two files map to the same route, the lower priority wins.
   * @default 0
   */
  priority?: number
}

export interface BuildTreeOptions extends ParsePathOptions {
  /**
   * Strategy when same relative path appears from multiple sources.
   *
   * - `'first-wins'` — keep the first file unless a later file has strictly
   *   higher priority (lower priority number). Equal priority = first inserted wins.
   * - `'last-wins'` — always replace with the later file.
   * - `'error'` — throw on duplicates.
   *
   * @default 'first-wins'
   */
  duplicateStrategy?: 'first-wins' | 'last-wins' | 'error'
}

/**
 * A route tree built from parsed file paths.
 */
export interface RouteTree {
  /** The root node (has no segment of its own) */
  root: RouteNode
}

// ============================================================================
// Tree construction
// ============================================================================

function createNode(rawSegment: string, segment: ParsedPathSegment, parent: RouteNode | null): RouteNode {
  return {
    rawSegment,
    segment,
    files: [],
    children: new Map(),
    parent,
  }
}

/**
 * Build a route tree from file paths in a single pass.
 *
 * Accepts:
 * - `string[]` — raw file paths, all at default priority 0
 * - `InputFile[]` — file paths with per-file priority
 * - `ParsedPath[]` — pre-parsed paths (priority defaults to 0)
 *
 * When files from different layers collide at the same tree position,
 * the file with the lowest priority number wins.
 */
export function buildTree(
  input: string[] | InputFile[] | ParsedPath[],
  options: BuildTreeOptions = {},
): RouteTree {
  const root = createNode('', [{ type: 'static', value: '' }], null)

  if (input.length === 0)
    return { root }

  // Determine input type and parse if needed
  if (isParsedPaths(input)) {
    for (const parsedPath of input)
      insertParsedPath(root, parsedPath, 0, options)
  }
  else if (isInputFiles(input)) {
    // InputFile[] — extract paths and priorities, parse in batch
    const paths = input.map(f => f.path)
    const priorities = input.map(f => f.priority ?? 0)
    const parsedPaths = parsePath(paths, options)
    for (let i = 0; i < parsedPaths.length; i++)
      insertParsedPath(root, parsedPaths[i], priorities[i], options)
  }
  else {
    // string[] — parse in batch, all priority 0
    const parsedPaths = parsePath(input as string[], options)
    for (const parsedPath of parsedPaths)
      insertParsedPath(root, parsedPath, 0, options)
  }

  return { root }
}

function isParsedPaths(input: unknown[]): input is ParsedPath[] {
  return input.length > 0 && typeof input[0] === 'object' && input[0] !== null && 'segments' in input[0]
}

function isInputFiles(input: unknown[]): input is InputFile[] {
  return input.length > 0 && typeof input[0] === 'object' && input[0] !== null && 'path' in input[0] && !('segments' in input[0])
}

function insertParsedPath(root: RouteNode, parsedPath: ParsedPath, priority: number, options: BuildTreeOptions): void {
  let current = root
  const groups: string[] = []

  for (const segment of parsedPath.segments) {
    if (segment.every(token => token.type === 'group')) {
      for (const token of segment) groups.push(token.value)
      continue
    }

    const segmentKey = segmentToKey(segment)
    if (!current.children.has(segmentKey)) {
      current.children.set(segmentKey, createNode(segmentKey, segment, current))
    }
    current = current.children.get(segmentKey)!
  }

  const viewName = parsedPath.meta?.name || 'default'
  const modes = parsedPath.meta?.modes
  const fileEntry: RouteNodeFile = {
    path: parsedPath.file,
    relativePath: reconstructRelativePath(parsedPath),
    viewName,
    modes,
    groups: [...groups],
    originalSegments: parsedPath.segments,
    priority,
  }

  // Dedup: files with the same view, modes, AND groups are duplicates.
  // Files with different group paths or different modes are NOT duplicates.
  // When duplicates collide, priority determines the winner.
  const groupKey = groups.join(',')
  const modesKey = modes?.slice().sort().join(',') ?? ''
  const existing = current.files.find((f) => {
    if (f.viewName !== viewName)
      return false
    if (f.groups.join(',') !== groupKey)
      return false
    const existingModesKey = f.modes?.slice().sort().join(',') ?? ''
    return existingModesKey === modesKey
  })
  if (existing) {
    const strategy = options.duplicateStrategy || 'first-wins'
    if (strategy === 'error')
      throw new Error(`Duplicate route file for view "${viewName}": "${existing.path}" and "${parsedPath.file}"`)
    if (strategy === 'last-wins') {
      current.files[current.files.indexOf(existing)] = fileEntry
    }
    else {
      // 'first-wins': keep the existing file unless the new one has strictly
      // lower priority number (higher priority). Equal priority = first inserted wins.
      if (priority < existing.priority)
        current.files[current.files.indexOf(existing)] = fileEntry
    }
  }
  else {
    current.files.push(fileEntry)
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Walk the tree depth-first, calling the visitor for each non-root node.
 */
export function walkTree(tree: RouteTree, visitor: (node: RouteNode, depth: number, parent: RouteNode | null) => void): void {
  function walk(node: RouteNode, depth: number) {
    if (depth > 0)
      visitor(node, depth, node.parent)
    for (const child of node.children.values())
      walk(child, depth + 1)
  }
  walk(tree.root, 0)
}

/**
 * Check if a node is a "page node" (has files attached).
 */
export function isPageNode(node: RouteNode): boolean {
  return node.files.length > 0
}

// ============================================================================
// Internal helpers
// ============================================================================

function segmentToKey(segment: ParsedPathSegment): string {
  return segment.map((token) => {
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
  }).join('')
}

function reconstructRelativePath(parsedPath: ParsedPath): string {
  const ext = parsedPath.file.match(/\.[^./]+$/)?.[0] || ''
  const path = parsedPath.segments.map(seg =>
    seg.map((t) => {
      switch (t.type) {
        case 'static': return t.value === '' ? 'index' : t.value
        case 'dynamic': return `[${t.value}]`
        case 'optional': return `[[${t.value}]]`
        case 'catchall': return `[...${t.value}]`
        case 'repeatable': return `[${t.value}]+`
        case 'optional-repeatable': return `[[${t.value}]]+`
        case 'group': return `(${t.value})`
        default: return t.value
      }
    }).join(''),
  ).join('/')
  return path + ext
}
