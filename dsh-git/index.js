/**
 * `@litingyes/dsh-git` host half.
 *
 * Mounts one thing: the prefix route (`api.js`) the browser panel reads and
 * mutates through. It is registered only when a `webServer` is composed, so a
 * profile without one stays mountable instead of throwing at load.
 *
 * There are no agent tools here, on purpose. An agent already knows git, so a
 * second, narrower verb set in front of it would only shorten what it can do;
 * the panel is the surface this package adds.
 *
 * Every service is reached through `ctx.inject([...], ...)`: a Host without a
 * web server or without a workspace registry mounts and does nothing, which is
 * the right failure for an optional panel.
 *
 * @module @litingyes/dsh-git
 */

import { API_PREFIX, createApi } from './api.js'
import { createGitService, createRunner } from './git.js'

export const name = 'dsh-git'

/** Bounds for every tunable in the row config. */
const BOUNDS = {
  maxCommits: [20, 500],
  maxDiffBytes: [10_000, 2_000_000],
  commandTimeoutMs: [500, 120_000],
}

/** Bounds fail loudly at mount rather than degrading silently at request time. */
function assertInteger(name, value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`dsh-git: ${name} must be an integer, got ${JSON.stringify(value)}`)
  }
  const [min, max] = BOUNDS[name]
  if (value < min || value > max) {
    throw new TypeError(`dsh-git: ${name} must be between ${min} and ${max}, got ${value}`)
  }
  return value
}

/**
 * Validate the row config and fill explicit defaults.
 *
 * @param {Record<string, unknown> | undefined} raw the row's `config`.
 * @returns {object} resolved config.
 */
export function resolveConfig(raw) {
  const config = raw ?? {}
  const refs = config.refs ?? 'all'
  if (refs !== 'all' && refs !== 'head') {
    throw new TypeError(`dsh-git: refs must be "all" or "head", got ${JSON.stringify(refs)}`)
  }
  return {
    refs,
    maxCommits: assertInteger('maxCommits', config.maxCommits ?? 200),
    maxDiffBytes: assertInteger('maxDiffBytes', config.maxDiffBytes ?? 400_000),
    commandTimeoutMs: assertInteger('commandTimeoutMs', config.commandTimeoutMs ?? 15_000),
  }
}

/**
 * Plugin entry.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx host context.
 * @param {Record<string, unknown>} [rawConfig] the row's `config`.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const run = createRunner({ timeoutMs: config.commandTimeoutMs })

  /** Built once, on the first injected scope that provides the registry. */
  let service = null
  const bindService = (scoped) => {
    if (service !== null) return service
    const registry = scoped.workspaceRegistry
    const workspaces = () => {
      const entries = typeof registry?.list === 'function' ? registry.list() : []
      return entries.map(entry => ({ id: String(entry.id), title: entry.title, path: entry.path }))
    }
    service = createGitService({ workspaces, config, run })
    return service
  }

  /**
   * `connection.requestRejection` answers the trust question. A Host without a
   * connection service has no peer auth plane, so it is trusted; a connection
   * that throws must never be read as "no auth".
   */
  const makeAuthorize = (scoped) => (req) => {
    let connection
    try {
      connection = scoped.get('connection')
    } catch {
      return 401
    }
    if (connection === undefined || connection === null) return undefined
    if (typeof connection.requestRejection !== 'function') return undefined
    return connection.requestRejection(req)
  }

  ctx.inject(['webServer', 'workspaceRegistry'], (scoped) => {
    const gitService = bindService(scoped)
    const authorize = makeAuthorize(scoped)
    scoped.effect(() => {
      const handler = createApi({ git: gitService, authorize })
      // `kind: 'prefix'` owns `/dsh-git` and everything below it.
      const dispose = scoped.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    }, 'dsh-git: api route')
  })
}
