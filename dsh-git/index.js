/**
 * `@litingyes/dsh-git` host half.
 *
 * Mounts two things on the same service:
 *   - a prefix route (`api.js`) that the browser panel reads and mutates
 *     through, mounted only when a `webServer` is composed;
 *   - four agent tools, registered only when `tools` is composed and the row
 *     config keeps them enabled.
 *
 * Both surfaces call `createGitService()` from `git.js`, so a tool and the
 * panel cannot drift apart in behaviour or in how they report a failure.
 *
 * Every optional service is reached through `ctx.inject([...], ...)`: a profile
 * without a web server, a workspace registry, or a tool registry stays
 * mountable instead of throwing at load.
 *
 * @module @litingyes/dsh-git
 */

import { API_PREFIX, createApi } from './api.js'
import { GitError, createGitService, createRunner } from './git.js'

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
  const defaultWorkspaceId = config.defaultWorkspaceId ?? ''
  if (typeof defaultWorkspaceId !== 'string') {
    throw new TypeError('dsh-git: defaultWorkspaceId must be a string')
  }
  const tools = config.tools ?? true
  if (typeof tools !== 'boolean') {
    throw new TypeError('dsh-git: tools must be a boolean')
  }
  return {
    refs,
    tools,
    defaultWorkspaceId,
    maxCommits: assertInteger('maxCommits', config.maxCommits ?? 200),
    maxDiffBytes: assertInteger('maxDiffBytes', config.maxDiffBytes ?? 400_000),
    commandTimeoutMs: assertInteger('commandTimeoutMs', config.commandTimeoutMs ?? 15_000),
  }
}

/** Read `name` off the tool arguments, treating blank as absent. */
function workspaceOf(args) {
  const value = args?.workspace
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** `HH:MM` style short date for one ISO timestamp, or the raw value. */
function shortDate(iso) {
  if (typeof iso !== 'string' || iso === '') return ''
  const at = iso.indexOf('T')
  return at === -1 ? iso : `${iso.slice(0, 10)} ${iso.slice(at + 1, at + 6)}`
}

/** One `status letter + path` line. */
function changeLine(entry) {
  const suffix = entry.origPath === null ? '' : `  (from ${entry.origPath})`
  return `  ${entry.status}  ${entry.path}${suffix}`
}

/**
 * Model-facing summary of one state snapshot.
 *
 * @param {object} state from `gitService.state()`.
 * @returns {string} multi-line text.
 */
export function renderStateText(state) {
  const lines = []
  const workspace = state.workspace
  lines.push(`workspace: ${workspace.title} (${workspace.path})`)

  if (state.repo?.isRepo !== true) {
    lines.push(`not a git repository: ${state.repo?.message ?? 'unknown reason'}`)
    return lines.join('\n')
  }

  const branch = state.branch ?? {}
  const tracking = branch.upstream === null || branch.upstream === undefined ? '' : ` -> ${branch.upstream}`
  const divergence = `↑${branch.ahead ?? 0} ↓${branch.behind ?? 0}`
  const head = branch.detached === true ? `detached at ${String(branch.oid ?? '').slice(0, 7)}` : String(branch.head ?? '(unknown)')
  lines.push(`repository: ${state.repo.name} @ ${state.repo.root}`)
  lines.push(`branch: ${head}${tracking} ${divergence}${state.isEmpty ? '  (no commits yet)' : ''}`)

  const changes = state.changes ?? { staged: [], unstaged: [], untracked: [], conflicted: [] }
  lines.push(
    `changes: ${changes.staged.length} staged, ${changes.unstaged.length} unstaged, ` +
      `${changes.untracked.length} untracked, ${changes.conflicted.length} conflicted`,
  )
  for (const [label, entries] of [
    ['staged', changes.staged],
    ['unstaged', changes.unstaged],
    ['untracked', changes.untracked],
    ['conflicted', changes.conflicted],
  ]) {
    if (entries.length === 0) continue
    lines.push(`${label}:`)
    for (const entry of entries.slice(0, 40)) lines.push(changeLine(entry))
    if (entries.length > 40) lines.push(`  … ${entries.length - 40} more`)
  }

  if (state.commits.length > 0) {
    lines.push(`commits (${state.commits.length} shown):`)
    for (const commit of state.commits.slice(0, 15)) {
      const badges = commit.refs.map(ref => ref.name).join(', ')
      const suffix = badges === '' ? '' : `  [${badges}]`
      lines.push(`  ${commit.short}  ${commit.subject}  — ${commit.author}, ${shortDate(commit.authorTime)}${suffix}`)
    }
    if (state.commits.length > 15) lines.push(`  … ${state.commits.length - 15} more`)
  }

  if (state.branches.length > 0) {
    const locals = state.branches.filter(entry => entry.type === 'local')
    lines.push(`branches: ${locals.map(entry => `${entry.name}${entry.current ? ' (current)' : ''}`).join(', ')}`)
  }
  return lines.join('\n')
}

/** The canonical value every tool returns; only `text` is guaranteed. */
const TEXT_OUTPUT = { type: 'string', description: 'Human-readable summary of the result.' }

/** Shared text renderer: the model reads this, not the structured value. */
function renderText(_args, value) {
  const text = typeof value?.text === 'string' ? value.text : JSON.stringify(value, null, 2)
  return [{ type: 'text', text }]
}

/**
 * The four tool definitions. Each is a plain registry-ready `ToolDefinition`:
 * raw JSON Schema (the enforced subset), a pure renderer, and one executor that
 * calls the same service the route calls.
 *
 * @param {object} service from `createGitService`.
 * @param {object} config resolved row config.
 * @returns {object[]} definitions.
 */
export function buildTools(service, config) {
  const defaultRefs = config.refs

  const statusTool = {
    name: 'git_status',
    description:
      'Read one DSH workspace\'s git state: branch and upstream divergence, staged/unstaged/untracked/conflicted files, recent commits across all branches, and local branches. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        workspace: {
          type: 'string',
          description: 'Workspace id. Omit for the most recently updated registered workspace.',
        },
        refs: {
          type: 'string',
          enum: ['all', 'head'],
          description: 'Track every branch (all) or only HEAD history (head). Defaults to the plugin config.',
        },
        limit: {
          type: 'integer',
          description: 'Commits to return, 1-500. Defaults to the plugin config.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: TEXT_OUTPUT,
          isRepo: { type: 'boolean' },
          isEmpty: { type: 'boolean' },
        },
        required: ['text', 'isRepo'],
      },
      render: renderText,
    },
    async execute(args, exec) {
      const state = await service.state({
        workspaceId: workspaceOf(args),
        refs: args?.refs ?? defaultRefs,
        limit: args?.limit,
        signal: exec.signal,
      })
      return {
        text: renderStateText(state),
        isRepo: state.repo?.isRepo === true,
        isEmpty: state.isEmpty === true,
        workspace: state.workspace,
        branch: state.branch,
        changes: state.changes,
        commits: state.commits,
        branches: state.branches,
      }
    },
  }

  const diffTool = {
    name: 'git_diff',
    description:
      'Read one unified diff from a DSH workspace: an unstaged working-tree file, a staged file, or a file inside a commit. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace id. Omit for the default workspace.' },
        target: {
          type: 'string',
          enum: ['worktree', 'index', 'commit'],
          description: 'worktree = unstaged changes, index = staged changes, commit = a specific commit.',
        },
        path: { type: 'string', description: 'Repository-relative path. Omit for the full diff.' },
        commit: { type: 'string', description: 'Commit object name; required when target is "commit".' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: TEXT_OUTPUT,
          target: { type: 'string' },
          binary: { type: 'boolean' },
          truncated: { type: 'boolean' },
        },
        required: ['text', 'target'],
      },
      render: renderText,
    },
    async execute(args, exec) {
      const patch = await service.diff({
        workspaceId: workspaceOf(args),
        target: args.target,
        path: args.path,
        commit: args.commit,
        signal: exec.signal,
      })
      const head = `diff (${patch.target}${patch.path === null ? '' : ` · ${patch.path}`})`
      const notes = []
      if (patch.binary) notes.push('binary file: no patch body')
      if (patch.truncated) notes.push(`patch truncated at ${patch.bytes} bytes`)
      const text = notes.length === 0
        ? `${head}\n\n${patch.patch}`
        : `${head} — ${notes.join('; ')}\n\n${patch.patch}`
      return { text: text.trimEnd(), ...patch }
    },
  }

  const commitTool = {
    name: 'git_commit',
    description:
      'Stage the given paths (or the whole working tree when omitted) and commit them. This writes to the repository; it is the same operation the Git panel\'s commit box performs.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace id. Omit for the default workspace.' },
        message: { type: 'string', description: 'Commit message. Must not be empty.' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repository-relative paths to stage before committing. Omit to commit what is already staged.',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: TEXT_OUTPUT,
          sha: { type: 'string' },
          short: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['text', 'sha', 'short'],
      },
      render: renderText,
    },
    async execute(args, exec) {
      const result = await service.commit({
        workspaceId: workspaceOf(args),
        message: args.message,
        paths: args.paths,
        signal: exec.signal,
      })
      return {
        text: `committed ${result.short}: ${result.summary}\nsha: ${result.sha}`,
        ...result,
      }
    },
  }

  const branchTool = {
    name: 'git_branch',
    description:
      'List, switch, or create local branches in one DSH workspace. Switching and creating write to the repository and fail when the working tree would be overwritten.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace id. Omit for the default workspace.' },
        action: {
          type: 'string',
          enum: ['list', 'checkout', 'create'],
          description: 'list reads branches; checkout switches to an existing one; create makes a new one at HEAD.',
        },
        branch: { type: 'string', description: 'Branch name; required for checkout and create.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: TEXT_OUTPUT,
          branch: { type: 'string' },
          branches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                current: { type: 'boolean' },
              },
              required: ['name', 'type', 'current'],
            },
          },
        },
        required: ['text'],
      },
      render: renderText,
    },
    async execute(args, exec) {
      const workspaceId = workspaceOf(args)
      if (args.action === 'checkout' || args.action === 'create') {
        if (typeof args.branch !== 'string' || args.branch.trim() === '') {
          throw new GitError('invalid_branch', `branch is required when action is "${args.action}"`)
        }
      }
      if (args.action === 'checkout') {
        const result = await service.checkout({ workspaceId, branch: args.branch, signal: exec.signal })
        return { text: `switched to ${result.branch}`, branch: result.branch }
      }
      if (args.action === 'create') {
        const result = await service.createBranch({ workspaceId, branch: args.branch, signal: exec.signal })
        return { text: `created and switched to ${result.branch}`, branch: result.branch }
      }
      const state = await service.state({ workspaceId, limit: 1, signal: exec.signal })
      const rows = state.branches.map(entry => ({
        name: entry.name,
        type: entry.type,
        current: entry.current,
        upstream: entry.upstream,
        commitTime: entry.commitTime,
      }))
      const text = rows.length === 0
        ? 'no branches'
        : rows
            .map(entry => `${entry.current ? '* ' : '  '}${entry.name} (${entry.type}${entry.upstream === '' ? '' : ` -> ${entry.upstream}`})`)
            .join('\n')
      return { text, branches: rows }
    },
  }

  return [statusTool, diffTool, commitTool, branchTool]
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

  if (config.tools) {
    ctx.inject(['tools', 'workspaceRegistry'], (scoped) => {
      const gitService = bindService(scoped)
      for (const definition of buildTools(gitService, config)) {
        scoped.effect(() => scoped.tools.register(definition), `dsh-git: ${definition.name} tool`)
      }
    })
  }
}
