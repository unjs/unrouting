import type { ParsedPath, ParsedPathSegment, ParsePathOptions } from './parse'
import { parsePath } from './parse'

// ============================================================================
// Types
// ============================================================================

/**
 * A file contributing to a route node.
 * Supports named views, mode variants, and per-file group tracking.
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

export interface BuildTreeOptions extends ParsePathOptions {
  /**
   * Strategy when same relative path appears from multiple sources.
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
 * Accepts either raw file paths (with parse options) or pre-parsed paths.
 * When given raw strings, parsing and tree insertion happen in one loop
 * with no intermediate array allocation.
 *
 * 1. For each file, parse its path into segments
 * 2. Walk segments creating/reusing tree nodes
 * 3. Group segments `(name)` are transparent — don't create tree depth
 * 4. The file is attached to the final (leaf) node
 */
export function buildTree(input: string[] | ParsedPath[], options: BuildTreeOptions = {}): RouteTree {
  const root = createNode('', [{ type: 'static', value: '' }], null)

  // If raw strings, parse them. parsePath already handles the batch efficiently
  // (builds regexes once). We could inline per-file parsing for zero intermediate
  // allocation, but parsePath is already O(n) and the regex compilation is the
  // expensive part — which it does once.
  const parsedPaths = isParsedPaths(input) ? input : parsePath(input, options)

  for (const parsedPath of parsedPaths) {
    insertParsedPath(root, parsedPath, options)
  }

  return { root }
}

function isParsedPaths(input: unknown[]): input is ParsedPath[] {
  return input.length > 0 && typeof input[0] === 'object' && input[0] !== null && 'segments' in input[0]
}

function insertParsedPath(root: RouteNode, parsedPath: ParsedPath, options: BuildTreeOptions): void {
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
  }

  // Dedup: files with the same view, modes, AND groups are duplicates.
  // Files with different group paths are NOT duplicates.
  const groupKey = groups.join(',')
  const existing = current.files.find(f =>
    f.viewName === viewName
    && !f.modes?.length && !modes?.length
    && f.groups.join(',') === groupKey,
  )
  if (existing) {
    const strategy = options.duplicateStrategy || 'first-wins'
    if (strategy === 'error')
      throw new Error(`Duplicate route file for view "${viewName}": "${existing.path}" and "${parsedPath.file}"`)
    if (strategy === 'last-wins')
      current.files[current.files.indexOf(existing)] = fileEntry
    // 'first-wins': skip
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
