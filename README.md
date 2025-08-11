# 📍 unrouting

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![Codecov][codecov-src]][codecov-href]
[![License][license-src]][license-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

> Making filesystem routing universal

## 🚧 In development

This library is a work in progress and in active development.

- [ ] generic route parsing function with options to cover major filesystem routing patterns
  - [x] [Nuxt](https://github.com/nuxt/nuxt)
  - [x] [unplugin-vue-router](https://github.com/posva/unplugin-vue-router) (does not include dot-syntax nesting support)
- [ ] export capability for framework routers
  - [x] RegExp patterns
  - [x] [`vue-router`](https://router.vuejs.org/) routes
  - [x] [rou3](http://github.com/h3js/rou3)/[Nitro](https://nitro.unjs.io/) routes
  - [ ] [SolidStart](https://start.solidjs.com/core-concepts/routing)
  - [ ] [SvelteKit](https://kit.svelte.dev/docs/routing) routes
- [ ] support scanning FS (with optional watch mode)
- [ ] and more

## Usage

Install package:

```sh
# npm
npm install unrouting

# pnpm
pnpm install unrouting
```

### Basic Parsing

```js
import { parsePath } from 'unrouting'

// Parse file paths into segments with mode detection
const [result] = parsePath(['users/[id]/profile.vue'])
console.log(result.segments)
// [
//   [{ type: 'static', value: 'users' }],
//   [{ type: 'dynamic', value: 'id' }],
//   [{ type: 'static', value: 'profile' }]
// ]
console.log(result.meta) // undefined (no metadata detected)
```

### Mode Detection

```js
import { parsePath } from 'unrouting'

// Configure mode detection for .server, .client suffixes
const [result] = parsePath(['app.server.vue'], {
  modes: ['server', 'client']
})

console.log(result.meta?.modes) // ['server']
console.log(result.segments) // [[{ type: 'static', value: 'app' }]]

// Multiple modes
const [result2] = parsePath(['api.server.edge.js'], {
  modes: ['server', 'client', 'edge']
})
console.log(result2.meta?.modes) // ['server', 'edge']
console.log(result2.segments) // [[{ type: 'static', value: 'api' }]]
```

### Named Views

```js
import { parsePath } from 'unrouting'

// Named views with @ suffix (for Vue Router named views)
const [result] = parsePath(['dashboard@sidebar.vue'])
console.log(result.meta?.name) // 'sidebar'
console.log(result.segments) // [[{ type: 'static', value: 'dashboard' }]]

// Named views with modes
const [result2] = parsePath(['admin@main.client.vue'], {
  modes: ['client', 'server']
})
console.log(result2.meta) // { name: 'main', modes: ['client'] }

// Nested named views
const [result3] = parsePath(['users/[id]@profile.vue'])
console.log(result3.meta?.name) // 'profile'
console.log(result3.segments)
// [
//   [{ type: 'static', value: 'users' }],
//   [{ type: 'dynamic', value: 'id' }]
// ]
```

### Convert to Router Formats

```js
import { parsePath, toRegExp, toRou3, toVueRouter4 } from 'unrouting'

const [result] = parsePath(['users/[id]/posts/[slug].vue'])

// Vue Router 4 format
const [vueRoute] = toVueRouter4([result])
console.log(vueRoute.path) // '/users/:id()/posts/:slug()'

// Rou3/Nitro format
const [nitroRoute] = toRou3([result])
console.log(nitroRoute) // '/users/:id/posts/:slug'

// RegExp pattern
const [regexpRoute] = toRegExp([result])
console.log(regexpRoute.pattern) // /^\/users\/([^\/]+)\/posts\/([^\/]+)\/?$/
console.log(regexpRoute.keys) // ['id', 'slug']

// Or pass file paths directly to converters
const [vueRoute2] = toVueRouter4(['users/[id]/posts/[slug].vue'])
const [nitroRoute2] = toRou3(['users/[id]/posts/[slug].vue'])
const [regexpRoute2] = toRegExp(['users/[id]/posts/[slug].vue'])
```

### Advanced Examples

```js
import { parsePath, toRegExp, toVueRouter4 } from 'unrouting'

// Repeatable parameters ([slug]+.vue -> one or more segments)
const [repeatable] = parsePath(['posts/[slug]+.vue'])
const [vueRoute1] = toVueRouter4([repeatable])
console.log(vueRoute1.path) // '/posts/:slug+'

// Optional repeatable parameters ([[slug]]+.vue -> zero or more segments)
const [optionalRepeatable] = parsePath(['articles/[[slug]]+.vue'])
const [vueRoute2] = toVueRouter4([optionalRepeatable])
console.log(vueRoute2.path) // '/articles/:slug*'

// Group segments (ignored in final path, useful for organization)
const [grouped] = parsePath(['(admin)/(dashboard)/users/[id].vue'])
const [vueRoute3] = toVueRouter4([grouped])
console.log(vueRoute3.path) // '/users/:id()'
// Groups are parsed but excluded from path generation

// Catchall routes ([...slug].vue -> captures remaining path)
const [catchall] = parsePath(['docs/[...slug].vue'])
const [vueRoute4] = toVueRouter4([catchall])
console.log(vueRoute4.path) // '/docs/:slug(.*)*'

// Optional parameters ([[param]].vue -> parameter is optional)
const [optional] = parsePath(['products/[[category]]/[[id]].vue'])
const [vueRoute5] = toVueRouter4([optional])
console.log(vueRoute5.path) // '/products/:category?/:id?'

// Complex mixed patterns
const [complex] = parsePath(['shop/[category]/product-[id]-[[variant]].vue'])
const [vueRoute6] = toVueRouter4([complex])
console.log(vueRoute6.path)
// '/shop/:category()/product-:id()-:variant?'

// Proper regex matching with anchoring (fixes partial match issues)
const [pattern] = toRegExp(['[slug].vue'])
console.log(pattern.pattern) // /^\/(?<slug>[^/]+)\/?$/
console.log('/file'.match(pattern.pattern)) // ✅ matches
console.log('/test/thing'.match(pattern.pattern)) // ❌ null (properly rejected)
```

## API

### `parsePath(filePaths, options?)`

Parse file paths into route segments with mode detection.

**Parameters:**
- `filePaths` (string[]): Array of file paths to parse
- `options` (object, optional):
  - `extensions` (string[]): File extensions to strip (default: all extensions)
  - `modes` (string[]): Mode suffixes to detect (e.g., `['server', 'client']`)
  - `warn` (function): Warning callback for invalid characters

**Returns:** `ParsedPath[]`
```ts
interface ParsedPath {
  segments: ParsedPathSegment[]
  meta?: {
    modes?: string[] // Detected mode suffixes (e.g., ['client', 'server'])
    name?: string // Named view from @name suffix
  }
}
```

### `toVueRouter4(filePaths)`

Convert parsed segments or file paths to Vue Router 4 format.

**Parameters:**
- `filePaths` (string[] | ParsedPath[]): Array of file paths or parsed path objects

**Returns:** `Array<{ path: string }>`

### `toRou3(filePaths)`

Convert parsed segments or file paths to Rou3/Nitro format.

**Parameters:**
- `filePaths` (string[] | ParsedPath[]): Array of file paths or parsed path objects

**Returns:** `string[]`

### `toRegExp(filePaths)`

Convert parsed segments or file paths to RegExp patterns.

**Parameters:**
- `filePaths` (string[] | ParsedPath[]): Array of file paths or parsed path objects

**Returns:** `Array<{ pattern: RegExp, keys: string[] }>`

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable` (use `npm i -g corepack` for Node.js < 16.10)
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
