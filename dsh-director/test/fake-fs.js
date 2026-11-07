/**
 * Test doubles for the Host half.
 *
 * `store.js` talks to the `ctx.fs` service, not to `node:fs`, so the tests can
 * use an in-memory filesystem with the same small contract: absolute-path
 * targets, versions for optimistic writes, and the two provider codes the store
 * maps (`FS_STALE_VERSION`, `FS_NOT_OBSERVED`). No temp directories and no DSH
 * installation are involved.
 *
 * @module @litingyes/dsh-director/test/fake-fs
 */

import { resolve } from 'node:path'

/**
 * Build an in-memory filesystem with the subset of `ctx.fs` the plugin uses.
 *
 * @param {{ cwd?: string }} [options] default resolve base.
 * @returns {object} fake filesystem plus `seed` / `get` helpers.
 */
export function createFakeFs(options = {}) {
  const base = options.cwd ?? '/workspace'
  const files = new Map()
  let counter = 0

  const targetOf = path => ({ targetKey: resolve(path), displayPath: resolve(path) })

  return {
    files,
    /** Seed a file before the test starts; returns its version. */
    seed(path, content) {
      counter += 1
      const version = `v${counter}`
      files.set(resolve(path), { content, version })
      return version
    },
    /** Read a seeded file record. */
    get(path) {
      return files.get(resolve(path))
    },
    async resolve(path, opts = {}) {
      const absolute = resolve(opts.cwd ?? base, path)
      return { targetKey: absolute, displayPath: absolute }
    },
    async stat(target) {
      const file = files.get(target.targetKey)
      if (file === undefined) return undefined
      return { version: file.version, type: 'file', size: file.content.length }
    },
    async readText(target) {
      const file = files.get(target.targetKey)
      if (file === undefined) {
        const error = new Error(`not found: ${target.displayPath}`)
        error.code = 'FS_NOT_FOUND'
        throw error
      }
      return file.content
    },
    async writeText(target, content, expected) {
      const current = files.get(target.targetKey)
      if (expected?.kind === 'createIfAbsent' && current !== undefined) {
        const error = new Error(`already exists: ${target.displayPath}`)
        error.code = 'FS_NOT_OBSERVED'
        throw error
      }
      if (expected?.version !== undefined) {
        if (current === undefined || current.version !== expected.version) {
          const error = new Error(`stale: ${target.displayPath}`)
          error.code = 'FS_STALE_VERSION'
          throw error
        }
      }
      counter += 1
      const version = `v${counter}`
      files.set(target.targetKey, { content, version })
      return {
        operation: current === undefined ? 'create' : 'update',
        version,
        before: current?.content ?? null,
        after: content,
      }
    },
  }
}

/**
 * A fake plugin context: the services `apply` and the tools read, plus capture
 * arrays so a test can inspect what got registered.
 *
 * @param {{ fs: object, cwd: string, withWeb?: boolean, withConnection?: boolean }} options setup.
 * @returns {object} fake context and capture arrays.
 */
export function createFakePluginContext(options) {
  const tools = []
  const skills = []
  const sections = []
  const routes = []
  const cwd = options.cwd ?? '/workspace'
  const ctx = {
    fs: options.fs,
    workingDirectory: { ensure: async () => cwd },
    tools: {
      register(definition) {
        tools.push(definition)
        return () => {}
      },
      get(name) {
        return tools.find(tool => tool.name === name)
      },
    },
    skills: {
      register(skill) {
        skills.push(skill)
        return () => {}
      },
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
      },
      getSectionOrder() {
        return 3100
      },
    },
    inject(names, callback) {
      const present = names.every(name => {
        if (name === 'webServer' || name === 'workspaceRegistry') return options.withWeb === true
        if (name === 'connection') return options.withConnection === true
        return ctx[name] !== undefined
      })
      if (present) callback(ctx)
    },
    effect(fn) {
      const dispose = fn()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    get(name) {
      if (name === 'connection') {
        return options.withConnection === true ? { requestRejection: () => undefined } : undefined
      }
      return ctx[name]
    },
  }
  if (options.withWeb === true) {
    ctx.webServer = {
      register(route) {
        routes.push(route)
        return () => {}
      },
    }
    ctx.workspaceRegistry = {
      list: () => [{ id: 'w1', title: 'Workspace', path: cwd }],
    }
  }
  return { ctx, tools, skills, sections, routes }
}
