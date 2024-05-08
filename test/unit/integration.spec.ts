import { describe, it } from 'vitest'

describe('nuxt routing', () => {
  const _staticExamples = {
    'index.vue': '/',
    'admin/index.vue': '/admin',
    'admin/users/index.vue': '/admin/users',
    'admin/settings/index.vue': '/admin/settings',
    'admin/settings/profile/index.vue': '/admin/settings/profile',
  }
  const _dynamicExamples = {
    'user/[userId].vue': [[{ userId: 'foo' }, '/user/foo']],
    'post/[slug].vue': [[{ slug: 'foo' }, '/post/foo']],
    'post/[...slug].vue': [
      [{}, '/post'],
      [{ slug: ['foo'] }, '/post/foo'],
      [{ slug: ['foo', 'bar'] }, '/post/foo/bar'],
    ],
  }
  it.todo('should parse examples', () => {

  })
})

describe('sveltekit routing', () => {
  const _staticExamples = {
    '+page.svelte': '/',
    'admin/+page.svelte': '/admin',
  }
  const _dynamicExamples = {
    'blog/[slug]/+page.svelte': [[{ slug: 'foo' }, '/blog/foo']],
  }
  it.todo('should serialise examples to routes', () => {})
})

describe('next.js app directory routing', () => {
  // examples of Next.js fs routing
  const _staticExamples = {
    'app/page.tsx': '/',
    'app/admin/page.tsx': '/admin',
    'app/admin/users/page.tsx': '/admin/users',
    'app/admin/settings/page.tsx': '/admin/settings',
    'app/admin/settings/profile/page.tsx': '/admin/settings/profile',
  }
  const _dynamicExamples = {
    'app/user/[userId]/page.tsx': [[{ userId: 'foo' }, '/user/foo']],
    'app/post/[slug]/page.tsx': [[{ slug: 'foo' }, '/post/foo']],
    'app/post/[...slug]/page.tsx': [
      [{}, '/post'],
      [{ slug: ['foo'] }, '/post/foo'],
      [{ slug: ['foo', 'bar'] }, '/post/foo/bar'],
    ],
  }
  it.todo('should parse examples', () => {})
  it.todo('should serialise examples to routes', () => {})
})
