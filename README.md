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
  - [ ] [unplugin-vue-router](https://github.com/posva/unplugin-vue-router)
- [ ] export capability for framework routers
  - [x] RegExp patterns
  - [x] [`vue-router`](https://router.vuejs.org/) routes
  - [ ] [radix3](http://github.com/unjs/radix3)/[Nitro](https://nitro.unjs.io/) routes
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

// Parse a file path into segments with mode detection
const result = parsePath('users/[id]/profile.vue')
console.log(result.segments)
// [
//   [{ type: 'static', value: 'users' }],
//   [{ type: 'dynamic', value: 'id' }], 
//   [{ type: 'static', value: 'profile' }]
// ]
console.log(result.modes) // undefined (no modes detected)
```

### Mode Detection

```js
import { parsePath } from 'unrouting'

// Configure mode detection for .server, .client suffixes
const result = parsePath('app.server.vue', { 
  modes: ['server', 'client'] 
})

console.log(result.modes) // ['server']
console.log(result.segments) // [[{ type: 'static', value: 'app' }]]

// Multiple modes
const result2 = parsePath('api.server.edge.js', { 
  modes: ['server', 'client', 'edge'] 
})
console.log(result2.modes) // ['server', 'edge']
console.log(result2.segments) // [[{ type: 'static', value: 'api' }]]
```

### Convert to Router Formats

```js
import { parsePath, toVueRouter4, toRadix3, toRegExp } from 'unrouting'

const result = parsePath('users/[id]/posts/[slug].vue')
const segments = result.segments

// Vue Router 4 format
const vueRoute = toVueRouter4(segments)
console.log(vueRoute.path) // '/users/:id()/posts/:slug()'

// Radix3/Nitro format  
const nitroRoute = toRadix3(segments)
console.log(nitroRoute) // '/users/:id/posts/:slug'

// RegExp pattern
const regexpRoute = toRegExp(segments)
console.log(regexpRoute.pattern) // /^\/users\/([^\/]+)\/posts\/([^\/]+)\/?$/
console.log(regexpRoute.keys) // ['id', 'slug']
```

### Advanced Examples

```js
import { parsePath } from 'unrouting'

// Group segments (ignored in final path)
const result = parsePath('(admin)/(dashboard)/users/[id].vue')
console.log(result.segments)
// Groups are parsed but skipped in path generation

// Catchall routes
const catchall = parsePath('docs/[...slug].vue')
// catchall.segments converts to /docs/:slug(.*)*

// Optional parameters
const optional = parsePath('products/[[category]]/[[id]].vue') 
// optional.segments converts to /products/:category?/:id?
```

## API

### `parsePath(filePath, options?)`

Parse a file path into route segments with mode detection.

**Parameters:**
- `filePath` (string): The file path to parse
- `options` (object, optional):
  - `extensions` (string[]): File extensions to strip (default: all extensions)
  - `modes` (string[]): Mode suffixes to detect (e.g., `['server', 'client']`)
  - `warn` (function): Warning callback for invalid characters

**Returns:** `ParsedPath`
```ts
interface ParsedPath {
  segments: ParsedPathSegment[]
  modes?: string[]
}
```

### `toVueRouter4(segments)`

Convert parsed segments to Vue Router 4 format.

**Parameters:**
- `segments` (ParsedPathSegment[]): The segments from `parsePath().segments`

**Returns:** `{ path: string }`

### `toRadix3(segments)`

Convert parsed segments to Radix3/Nitro format.

**Parameters:**
- `segments` (ParsedPathSegment[]): The segments from `parsePath().segments`

**Returns:** `string`

### `toRegExp(segments)`

Convert parsed segments to RegExp pattern.

**Parameters:**
- `segments` (ParsedPathSegment[]): The segments from `parsePath().segments`

**Returns:** `{ pattern: RegExp, keys: string[] }`

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
