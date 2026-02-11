# 📍 unrouting

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![Codecov][codecov-src]][codecov-href]
[![License][license-src]][license-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

> Universal filesystem routing

`unrouting` parses file paths into a route tree and emits route definitions for any framework router. It handles the complete pipeline that frameworks like Nuxt implement internally — nested routes, dynamic params, catchalls, optional segments, route groups, layer merging, and more — as a standalone, framework-agnostic library.

## Status

In active development. The core pipeline (parse, tree, emit) is functional and tested against Nuxt's route generation output.

- [x] Generic route parsing covering major filesystem routing patterns
  - [x] [Nuxt](https://github.com/nuxt/nuxt) / [unplugin-vue-router](https://github.com/posva/unplugin-vue-router)
  - [ ] [SvelteKit](https://kit.svelte.dev/docs/routing)
  - [ ] [Next.js](https://nextjs.org/docs/app/building-your-application/routing)
- [x] Route tree with nesting, layer merging, group transparency
- [x] Emit to framework routers
  - [x] [`vue-router`](https://router.vuejs.org/) (nested routes, names, files, meta)
  - [x] [rou3](http://github.com/h3js/rou3)/[Nitro](https://nitro.unjs.io/)
  - [x] RegExp patterns
  - [ ] [SolidStart](https://start.solidjs.com/core-concepts/routing)
  - [ ] [SvelteKit](https://kit.svelte.dev/docs/routing)
- [ ] Pluggable route name generation
- [ ] Route ordering / priority scoring
- [ ] Tree transformation API (for i18n, custom route manipulation)
- [ ] Filesystem scanning (with optional watch mode)

## Install

```sh
# npm
npm install unrouting

# pnpm
pnpm install unrouting
```

## Usage

The library has a three-phase pipeline: **parse** file paths into tokens, **build** a route tree, and **emit** to a target format. For most use cases you only need two function calls.

### Quick start

```js
import { buildTree, toVueRouter4 } from 'unrouting'

const tree = buildTree([
  'pages/index.vue',
  'pages/about.vue',
  'pages/users/[id].vue',
  'pages/users.vue',
  'pages/[...slug].vue',
], { roots: ['pages/'] })

const routes = toVueRouter4(tree)
// [
//   { name: 'index', path: '/', file: 'pages/index.vue', children: [] },
//   { name: 'about', path: '/about', file: 'pages/about.vue', children: [] },
//   { name: 'users', path: '/users', file: 'pages/users.vue', children: [
//     { name: 'users-id', path: ':id()', file: 'pages/users/[id].vue', children: [] },
//   ]},
//   { name: 'slug', path: '/:slug(.*)*', file: 'pages/[...slug].vue', children: [] },
// ]
```

### Nuxt-like usage with layers

```js
import { buildTree, toVueRouter4 } from 'unrouting'

// Files from app + layer directories
const tree = buildTree([
  'pages/index.vue',
  'pages/dashboard.vue',
  'pages/dashboard/settings.vue',
  'layer/pages/dashboard/analytics.vue',
], {
  roots: ['pages/', 'layer/pages/'],
  extensions: ['.vue'],
  modes: ['client', 'server'],
})

const routes = toVueRouter4(tree)
```

`buildTree` accepts raw file paths and handles parsing internally in a single pass — no intermediate array allocation needed.

### Emitting to different formats

All emitters accept a `RouteTree`:

```js
import { buildTree, toRegExp, toRou3, toVueRouter4 } from 'unrouting'

const tree = buildTree(['users/[id]/posts/[slug].vue'])

// Vue Router 4 — nested routes with names, files, children
const vueRoutes = toVueRouter4(tree)
// [{ name: 'users-id-posts-slug', path: '/users/:id()/posts/:slug()', file: '...', children: [] }]

// rou3/Nitro — flat route patterns
const rou3Routes = toRou3(tree)
// [{ path: '/users/:id/posts/:slug', file: '...' }]

// RegExp — matcher patterns with named groups
const regexpRoutes = toRegExp(tree)
// [{ pattern: /^\/users\/(?<id>[^/]+)\/posts\/(?<slug>[^/]+)\/?$/, keys: ['id', 'slug'], file: '...' }]
```

### Standalone parsing

If you need parsed segments without building a tree (e.g., for custom processing):

```js
import { parsePath } from 'unrouting'

const [result] = parsePath(['users/[id]/profile.vue'])
// {
//   file: 'users/[id]/profile.vue',
//   segments: [
//     [{ type: 'static', value: 'users' }],
//     [{ type: 'dynamic', value: 'id' }],
//     [{ type: 'static', value: 'profile' }],
//   ],
//   meta: undefined,
// }
```

## Supported patterns

| Pattern | Example | Description |
|---|---|---|
| Static | `about.vue` | Static route segment |
| Index | `index.vue` | Index page (maps to `/`) |
| Dynamic | `[slug].vue` | Required parameter |
| Optional | `[[slug]].vue` | Optional parameter |
| Catchall | `[...slug].vue` | Catch-all (zero or more segments) |
| Repeatable | `[slug]+.vue` | One or more segments |
| Optional repeatable | `[[slug]]+.vue` | Zero or more segments |
| Group | `(admin)/dashboard.vue` | Route group (transparent to path, stored in meta) |
| Mixed | `prefix-[slug]-suffix.vue` | Static and dynamic in one segment |
| Nested | `parent.vue` + `parent/child.vue` | Parent layout with child routes |
| Named views | `index@sidebar.vue` | Vue Router named view slots |
| Modes | `page.client.vue` | Mode variants (configurable suffixes) |

## API

### `buildTree(input, options?)`

Build a route tree from file paths. Accepts raw strings (parses internally) or pre-parsed `ParsedPath[]`.

```ts
function buildTree(input: string[] | ParsedPath[], options?: BuildTreeOptions): RouteTree
```

**Options** (extends `ParsePathOptions`):

| Option | Type | Description |
|---|---|---|
| `roots` | `string[]` | Root paths to strip (e.g., `['pages/', 'layer/pages/']`) |
| `extensions` | `string[]` | File extensions to strip (default: strip all) |
| `modes` | `string[]` | Mode suffixes to detect (e.g., `['client', 'server']`) |
| `warn` | `(msg: string) => void` | Warning callback for invalid characters |
| `duplicateStrategy` | `'first-wins' \| 'last-wins' \| 'error'` | How to handle duplicate paths (default: `'first-wins'`) |

### `toVueRouter4(tree, options?)`

Emit Vue Router 4 route definitions from a tree. Handles nested routes, names, index promotion, structural collapse, groups, and catchall optimisation.

```ts
function toVueRouter4(tree: RouteTree, options?: VueRouterEmitOptions): VueRoute[]

interface VueRoute {
  name?: string
  path: string
  file?: string
  children: VueRoute[]
  meta?: Record<string, unknown>
}
```

### `toRou3(tree)`

Emit rou3/Nitro route patterns from a tree.

```ts
function toRou3(tree: RouteTree): Rou3Route[]

interface Rou3Route {
  path: string
  file: string
}
```

### `toRegExp(tree)`

Emit RegExp matchers from a tree.

```ts
function toRegExp(tree: RouteTree): RegExpRoute[]

interface RegExpRoute {
  pattern: RegExp
  keys: string[]
  file: string
}
```

### `parsePath(filePaths, options?)`

Parse file paths into segments. Standalone — does not build a tree.

```ts
function parsePath(filePaths: string[], options?: ParsePathOptions): ParsedPath[]

interface ParsedPath {
  file: string
  segments: ParsedPathSegment[]
  meta?: { modes?: string[], name?: string }
}
```

### `walkTree(tree, visitor)`

Walk all nodes depth-first.

```ts
function walkTree(
  tree: RouteTree,
  visitor: (node: RouteNode, depth: number, parent: RouteNode | null) => void
): void
```

### `isPageNode(node)`

Check if a node has files attached (page node vs structural node).

```ts
function isPageNode(node: RouteNode): boolean
```

## How nesting works

The tree distinguishes between **page nodes** (have files) and **structural nodes** (directory-only, no files):

- **Page nodes** create nesting boundaries — children get relative paths
- **Structural nodes** collapse — their path segment is prepended to descendants

```
parent.vue + parent/child.vue
  → { path: '/parent', children: [{ path: 'child' }] }

parent/child.vue  (no parent.vue)
  → { path: '/parent/child' }  (structural 'parent' collapses)
```

`index.vue` promotes a structural directory into a page node:

```
users/index.vue + users/[id].vue
  → { path: '/users', file: 'users/index.vue', children: [{ path: ':id()' }] }
```

Route groups `(name)` are transparent — they don't affect paths or nesting, but are stored in `meta.groups`.

## Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with ❤️

Published under [MIT License](./LICENCE).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/unrouting?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/unrouting
[npm-downloads-src]: https://img.shields.io/npm/dm/unrouting?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/unrouting
[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/unrouting/main?style=flat&colorA=18181B&colorB=F0DB4F
[codecov-href]: https://codecov.io/gh/unjs/unrouting
[bundle-src]: https://img.shields.io/bundlephobia/minzip/unrouting?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=unrouting
[license-src]: https://img.shields.io/github/license/unjs/unrouting.svg?style=flat&colorA=18181B&colorB=F0DB4F
[license-href]: https://github.com/unjs/unrouting/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsDocs.io-reference-18181B?style=flat&colorA=18181B&colorB=F0DB4F
[jsdocs-href]: https://www.jsdocs.io/package/unrouting
