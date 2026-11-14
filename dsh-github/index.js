/**
 * `@litingyes/dsh-github` host half.
 *
 * Three registrations, each with one job:
 *
 *   1. **A prompt section** that names `mcp__<serverName>__*` and says when those
 *      tools should beat `gh` and `web_fetch`. The MCP client re-publishes the
 *      server's own `instructions`, but those never say which repository the
 *      Session is about; this section does, and it disappears when the tools are
 *      absent so a profile without a token renders nothing.
 *   2. **A write-approval listener** on `tools/pre-execute`. GitHub's remote MCP
 *      server declares `readOnlyHint`, but the MCP client keeps only names and
 *      schemas, so this Host classifies by tool name (`isWriteTool`) and returns
 *      `ask`; the harness then routes the decision through the approval service,
 *      and a refusal is a refusal rather than a silent skip.
 *   3. **A prefix route** (`api.js`) the right-sidebar panel reads and writes
 *      through, plus the credential bridge (`auth.js`) behind its import button.
 *
 * There are no agent tools of this plugin's own: the tools are the MCP row's,
 * and this package adds the human surface and the guard around them.
 *
 * Every optional service is reached through `ctx.inject` or a guarded `get`, so
 * a composition without a web server, a credentials provider or a system prompt
 * still mounts.
 *
 * @module @litingyes/dsh-github
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { API_PREFIX, createApi } from './api.js'
import { DEFAULT_CREDENTIAL_REF, createAuth } from './auth.js'
import { createGithub, isWriteTool } from './github.js'

const execFileAsync = promisify(execFile)

export const name = 'dsh-github'

/** Same contract the MCP client enforces for `serverName`. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u

/** A credential name is a POSIX shell identifier. */
const CREDENTIAL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u

/**
 * Section order used when the Harness no longer resolves `MCP_SERVERS`, so
 * guidance never becomes a silent no-op on a newer runtime. Mirrors 3100 + 1.
 */
const FALLBACK_SECTION_ORDER = 3101

/** Config defaults; a row may override any field. */
export const DEFAULT_CONFIG = Object.freeze({
  serverName: 'github',
  guidance: true,
  approval: true,
  approvalTools: [],
  skipApprovalTools: [],
  credentialRef: DEFAULT_CREDENTIAL_REF,
  ghCommand: 'gh',
  apiBase: 'https://api.github.com',
  maxItems: 30,
  cacheMs: 60_000,
  requestTimeoutMs: 15_000,
  panelWrites: true,
})

/**
 * Validate the row config.
 *
 * Bounds fail at mount rather than degrading at request time: a misconfigured
 * page size is a mistake the user can see immediately.
 *
 * @param {Record<string, unknown> | undefined} raw the row's `config`.
 * @returns {typeof DEFAULT_CONFIG} resolved config.
 */
export function resolveConfig(raw) {
  const config = raw ?? {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('dsh-github: config must be an object')
  }

  const serverName = config.serverName ?? DEFAULT_CONFIG.serverName
  if (typeof serverName !== 'string' || !SERVER_NAME_PATTERN.test(serverName)) {
    throw new TypeError(`dsh-github: serverName must match ${String(SERVER_NAME_PATTERN)}, got ${JSON.stringify(serverName)}`)
  }

  const credentialRef = config.credentialRef ?? DEFAULT_CONFIG.credentialRef
  if (typeof credentialRef !== 'string' || !CREDENTIAL_PATTERN.test(credentialRef)) {
    throw new TypeError(`dsh-github: credentialRef must be a shell identifier, got ${JSON.stringify(credentialRef)}`)
  }

  const integer = (field, min, max) => {
    const value = config[field] ?? DEFAULT_CONFIG[field]
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new TypeError(`dsh-github: ${field} must be an integer between ${min} and ${max}, got ${JSON.stringify(value)}`)
    }
    return value
  }

  const bool = field => {
    const value = config[field] ?? DEFAULT_CONFIG[field]
    if (typeof value !== 'boolean') {
      throw new TypeError(`dsh-github: ${field} must be a boolean, got ${JSON.stringify(value)}`)
    }
    return value
  }

  const strings = field => {
    const value = config[field] ?? DEFAULT_CONFIG[field]
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
      throw new TypeError(`dsh-github: ${field} must be an array of strings`)
    }
    return [...value]
  }

  const ghCommand = config.ghCommand ?? DEFAULT_CONFIG.ghCommand
  if (typeof ghCommand !== 'string' || ghCommand.trim() === '') {
    throw new TypeError('dsh-github: ghCommand must be a non-empty string')
  }

  const apiBase = config.apiBase ?? DEFAULT_CONFIG.apiBase
  if (typeof apiBase !== 'string' || !/^https?:\/\//u.test(apiBase)) {
    throw new TypeError('dsh-github: apiBase must be an http(s) URL')
  }

  return {
    serverName,
    guidance: bool('guidance'),
    approval: bool('approval'),
    approvalTools: strings('approvalTools'),
    skipApprovalTools: strings('skipApprovalTools'),
    credentialRef,
    ghCommand: ghCommand.trim(),
    apiBase: apiBase.replace(/\/+$/u, ''),
    maxItems: integer('maxItems', 10, 100),
    cacheMs: integer('cacheMs', 0, 600_000),
    requestTimeoutMs: integer('requestTimeoutMs', 1_000, 60_000),
    panelWrites: bool('panelWrites'),
  }
}

/**
 * The model-facing trigger text.
 *
 * States the situation, the calls, what they should beat, and how to find the
 * repository — the four things the server's own instructions and the tool
 * descriptions leave implicit.
 *
 * @param {string} serverName the MCP row's `serverName`, which prefixes tool names.
 * @returns {string} section text.
 */
export function guidanceText(serverName) {
  const prefix = `mcp__${serverName}__`
  return (
    `For anything on GitHub — issues, pull requests, reviews, checks, releases, code search, notifications, or changing any of them — call the ${prefix}* tools (for example ${prefix}get_me, ${prefix}list_issues, ${prefix}issue_read, ${prefix}create_pull_request) before reaching for the gh CLI or web_fetch. ` +
    'The repository is the one the workspace is cloned from (`git remote get-url origin`, owner/repo); pass that owner and repo explicitly instead of asking the user which repository they mean. ' +
    `Tool names that write (create, update, merge, comment, push, or a *_write suffix) require the user's approval, so state what you intend to change before calling them. ` +
    `When no ${prefix} tool is available, GitHub tools are not configured: say so and point at the plugin's settings instead of guessing repository contents.`
  )
}

/**
 * Resolve the section placement directly below the MCP client's own section.
 *
 * @param {{getSectionOrder?: (name: string) => number}} systemPrompt registry service.
 * @returns {number} finite order.
 */
function sectionOrder(systemPrompt) {
  const base =
    typeof systemPrompt.getSectionOrder === 'function' ? systemPrompt.getSectionOrder('MCP_SERVERS') : undefined
  return Number.isFinite(base) ? base + 1 : FALLBACK_SECTION_ORDER
}

/**
 * Read the GitHub token from the credential store, then from the environment.
 *
 * Read per request rather than captured at mount: the user can import a token
 * without restarting the Host, and a revoked one is picked up immediately.
 *
 * @param {(name: string) => unknown} getService guarded service lookup.
 * @param {string} credentialRef credential name.
 * @returns {() => Promise<string | undefined>} token reader.
 */
function makeTokenReader(getService, credentialRef) {
  return async () => {
    const credentials = getService('credentials')
    if (credentials !== undefined && typeof credentials.resolve === 'function') {
      try {
        const hit = await credentials.resolve(credentialRef)
        if (typeof hit?.value === 'string' && hit.value.trim() !== '') return hit.value
      } catch {
        // A provider that cannot answer falls through to the environment; the
        // request then fails with `no_token` or succeeds with a real one.
      }
    }
    const fromEnv = process.env[credentialRef]
    return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv : undefined
  }
}

/**
 * Run `git` in the Session directory.
 *
 * @param {string[]} args git arguments.
 * @param {{cwd: string}} options working directory.
 * @returns {Promise<string>} trimmed stdout.
 */
async function runGit(args, options) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: options.cwd,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  })
  return stdout
}

/**
 * Run the gh executable and hand back its stdout.
 *
 * @param {string} command executable name or path.
 * @param {string[]} args arguments.
 * @param {{timeout?: number}} [options] child process options.
 * @returns {Promise<{stdout: string}>} captured output.
 */
async function runGh(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    timeout: options.timeout ?? 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  })
  return { stdout }
}

/**
 * Plugin entry.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx host context.
 * @param {Record<string, unknown>} [rawConfig] the row's `config`.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)

  /** A service that may not be composed; `get` throws when it is unknown. */
  const getService = name => {
    try {
      return ctx.get(name)
    } catch {
      return undefined
    }
  }

  if (config.guidance) {
    const queryTool = `mcp__${config.serverName}__get_me`
    const text = guidanceText(config.serverName)
    ctx.inject(['systemPrompt', 'tools'], host => {
      host.systemPrompt.section({
        name: `mcp:${config.serverName}:guidance`,
        order: sectionOrder(host.systemPrompt),
        interpolate: false,
        /**
         * Registered for the whole Host, so it renders for every Agent — keep
         * it empty while the connector it talks about is absent (no token, a
         * failed startup, or a rename that did not reach this config).
         */
        text: (context = {}) => {
          const scope = context?.scope
          return host.tools.get(queryTool, scope) === undefined ? '' : text
        },
      })
    })
  }

  if (config.approval) {
    const prefix = `mcp__${config.serverName}__`
    ctx.effect(
      () =>
        ctx.on('tools/pre-execute', (exec, next) => {
          if (typeof exec?.name !== 'string' || !exec.name.startsWith(prefix)) return next()
          const bare = exec.name.slice(prefix.length)
          if (config.skipApprovalTools.includes(bare)) return next()
          return config.approvalTools.includes(bare) || isWriteTool(bare)
            ? {
                kind: 'ask',
                reason: `GitHub write: ${bare}`,
                displayReason: {
                  en: `Allow the agent to call the GitHub write tool "${bare}"?`,
                  zh: `允许智能体调用 GitHub 写入工具 ${bare}？`,
                },
              }
            : next()
        }),
      'dsh-github: write approval',
    )
  }

  ctx.inject(['webServer'], scoped => {
    const github = createGithub({
      run: runGit,
      tokenFor: makeTokenReader(getService, config.credentialRef),
      apiBase: config.apiBase,
      timeoutMs: config.requestTimeoutMs,
      maxItems: config.maxItems,
      cacheMs: config.cacheMs,
    })

    const auth = createAuth({
      // Resolved per call: the store may be mounted after this callback runs.
      getCredentials: () => getService('credentials'),
      credentialRef: config.credentialRef,
      ghCommand: config.ghCommand,
      exec: runGh,
      apiBase: config.apiBase,
    })

    /**
     * `connection.requestRejection` answers the trust question. A Host without
     * a connection service has no peer auth plane, so it is trusted; a
     * connection that throws must never be read as "no auth".
     */
    const authorize = req => {
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

    scoped.effect(() => {
      const handler = createApi({ github, auth, panelWrites: config.panelWrites, authorize })
      const dispose = scoped.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    }, 'dsh-github: api route')
  })
}
