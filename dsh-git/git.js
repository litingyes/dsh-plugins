/**
 * `@litingyes/dsh-git` host Git layer.
 *
 * One service answers every read and every mutation. The HTTP route
 * (`api.js`) is its only caller, so the panel never diverges from the module in
 * behaviour or in the way a failure reaches the screen.
 *
 * Design constraints, all of them deliberate:
 *   - `git` is spawned with `execFile` and an argument array. There is no
 *     shell, so no branch name, path, or commit message can be reinterpreted
 *     as syntax.
 *   - Paths reaching a git command are workspace-relative and pass
 *     `assertRelativePath`; workspace roots come from the Host's workspace
 *     registry, never from the browser.
 *   - Destructive operations re-check the path against a freshly read status
 *     before touching it.
 *   - Every parser tolerates the shapes git actually emits (renames, unmerged
 *     entries, unborn HEAD, detached HEAD) and reports a structured error
 *     instead of throwing an unhelpful exception.
 *
 * @module @litingyes/dsh-git/git
 */

import { execFile } from 'node:child_process'
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Errors carry a stable machine code plus the message shown to a human. */
export class GitError extends Error {
  /**
   * @param {string} code stable machine code, e.g. `invalid_path`.
   * @param {string} message human-facing explanation.
   * @param {Record<string, unknown>} [detail] optional extra context.
   */
  constructor(code, message, detail) {
    super(message)
    this.name = 'GitError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

/** Git's own record separator for `--pretty` output. */
const FIELD = '\u001f'
/** Git's own commit separator for `--pretty` output. */
const RECORD = '\u001e'

/** Status letters git may emit; anything else is folded to `?`. */
const KNOWN = new Set(['M', 'A', 'D', 'R', 'C', 'T', 'U'])

/* ------------------------------------------------------------------ *
 * Argument validation
 * ------------------------------------------------------------------ */

/**
 * Reject anything that is not a repo-relative path.
 *
 * The value later reaches `git <cmd> -- <path>`; git would interpret an
 * absolute path or a `..` segment as an escape from the repository, so these
 * are refused before a command is built.
 *
 * @param {unknown} value candidate path.
 * @returns {string} the same path when acceptable.
 * @throws {GitError} `invalid_path`.
 */
export function assertRelativePath(value) {
  if (typeof value !== 'string') throw new GitError('invalid_path', 'path must be a string')
  const input = value
  if (input.length === 0) throw new GitError('invalid_path', 'path must not be empty')
  if (input.length > 4096) throw new GitError('invalid_path', 'path is too long')
  if (input.includes('\0')) throw new GitError('invalid_path', 'path contains a NUL byte')
  if (input.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(input)) {
    throw new GitError('invalid_path', 'path must be relative to the repository root')
  }
  for (const segment of input.split('/')) {
    if (segment === '..') throw new GitError('invalid_path', 'path must not contain ".." segments')
  }
  if (input === '.' || input === '') throw new GitError('invalid_path', 'path must name a file or directory')
  return input
}

/**
 * Normalize a path array, de-duplicate it, and refuse an empty result.
 *
 * @param {unknown} value `string` or `string[]`.
 * @param {string} label argument name used in the error message.
 * @returns {string[]} validated, de-duplicated paths.
 */
export function assertPathList(value, label = 'paths') {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined
  if (raw === undefined) throw new GitError('invalid_path', `${label} must be a string or an array of strings`)
  if (raw.length === 0) throw new GitError('invalid_path', `${label} must not be empty`)
  if (raw.length > 500) throw new GitError('invalid_path', `${label} accepts at most 500 entries`)
  const seen = new Set()
  for (const entry of raw) seen.add(assertRelativePath(entry))
  return [...seen]
}

/**
 * Accept a SHA-1/SHA-256 object name in abbreviated or full form.
 *
 * @param {unknown} value candidate revision.
 * @returns {string} the lower-cased hex string.
 */
export function assertCommitId(value) {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{4,64}$/u.test(value)) {
    throw new GitError('invalid_commit', 'commit must be a hexadecimal object name')
  }
  return value.toLowerCase()
}

/**
 * Validate a branch name through git itself rather than a hand-written regex.
 *
 * @param {(args: string[], options?: object) => Promise<{stdout: string}>} run
 * @param {string} cwd repository root.
 * @param {unknown} value candidate branch name.
 * @returns {Promise<string>} the trimmed, valid branch name.
 */
export async function assertBranchName(run, cwd, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GitError('invalid_branch', 'branch must be a non-empty string')
  }
  const name = value.trim()
  if (name.length > 255) throw new GitError('invalid_branch', 'branch is too long')
  if (name.startsWith('-')) throw new GitError('invalid_branch', 'branch must not start with "-"')
  try {
    await run(['check-ref-format', '--branch', name], { cwd })
  } catch (error) {
    throw new GitError('invalid_branch', `"${name}" is not a valid branch name`, {
      cause: error instanceof Error ? error.message : String(error),
    })
  }
  return name
}

/* ------------------------------------------------------------------ *
 * Process execution
 * ------------------------------------------------------------------ */

/** Environment overrides that keep git non-interactive and machine-readable. */
function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    GIT_ASKPASS: 'echo',
    LC_ALL: 'C',
  }
}

/**
 * Build a `runGit` function bound to one timeout.
 *
 * @param {{ timeoutMs?: number }} [options] runner options.
 * @returns {(args: string[], options?: object) => Promise<{stdout: string, stderr: string, code: number}>}
 */
export function createRunner(options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000

  /**
   * @param {string[]} args git arguments (subcommand first).
   * @param {object} [call] invocation options.
   * @param {string} [call.cwd] working directory; defaults to the process cwd.
   * @param {AbortSignal} [call.signal] caller cancellation.
   * @param {number[]} [call.allowCodes] exit codes treated as success (diff uses 1).
   * @param {number} [call.maxBuffer] stdout/stderr cap.
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  return function runGit(args, call = {}) {
    const cwd = call.cwd
    const signal = call.signal
    const allowCodes = call.allowCodes ?? []
    const maxBuffer = call.maxBuffer ?? 8 * 1024 * 1024
    const argv = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'advice.detachedHead=false', ...args]

    return new Promise((resolve, reject) => {
      let settled = false
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      const onAbort = () => controller.abort()
      if (signal !== undefined) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        fn(value)
      }

      execFile(
        'git',
        argv,
        { cwd, env: gitEnv(), maxBuffer, signal: controller.signal, windowsHide: true },
        (error, stdout, stderr) => {
          const out = typeof stdout === 'string' ? stdout : String(stdout ?? '')
          const err = typeof stderr === 'string' ? stderr : String(stderr ?? '')
          if (error === null || error === undefined) {
            finish(resolve, { stdout: out, stderr: err, code: 0 })
            return
          }
          const code = typeof error.code === 'number' ? error.code : 1
          if (allowCodes.includes(code)) {
            finish(resolve, { stdout: out, stderr: err, code })
            return
          }
          if (error.code === 'ENOENT') {
            finish(reject, new GitError('git_missing', 'the "git" executable was not found on PATH'))
            return
          }
          if (timedOut) {
            finish(reject, new GitError('git_timeout', `git ${args[0] ?? ''} timed out after ${timeoutMs} ms`))
            return
          }
          if (controller.signal.aborted) {
            finish(reject, new GitError('aborted', 'the git command was cancelled'))
            return
          }
          // A conflict explanation is written to stdout by merge, cherry-pick,
          // and revert, so a failure that only reads stderr would report the bare
          // exit code. Read stderr first (the usual failure channel) and fall back
          // to the first non-empty stdout line before giving up.
          const firstLineOf = text => text.split('\n').map(line => line.trim()).find(line => line !== '') ?? ''
          const firstLine = firstLineOf(err) || firstLineOf(out)
          finish(
            reject,
            new GitError('git_failed', firstLine === '' ? `git ${args[0] ?? ''} exited with code ${code}` : firstLine, {
              args,
              code,
            }),
          )
        },
      )
    })
  }
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

/**
 * Parse `git status --porcelain=v2 --branch -z`.
 *
 * Header records may arrive newline-separated, NUL-separated, or glued to the
 * first entry, so the loop peels `#` lines off whatever record carries them.
 * A rename record (`2 …`) is followed by its original path as the next
 * NUL-separated record.
 *
 * @param {string} text raw stdout.
 * @returns {{
 *   branch: {oid: string|null, head: string|null, upstream: string|null, ahead: number, behind: number, detached: boolean, unborn: boolean},
 *   changes: {staged: object[], unstaged: object[], untracked: object[], conflicted: object[]},
 * }}
 */
export function parsePorcelainV2(text) {
  const branch = {
    oid: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false,
  }
  const changes = { staged: [], unstaged: [], untracked: [], conflicted: [] }
  if (typeof text !== 'string' || text === '') return { branch, changes }

  const pending = []
  let awaitingOrig = null

  const flush = () => {
    for (const entry of pending) {
      if (entry.kind === 'untracked') {
        changes.untracked.push(entry)
      } else if (entry.kind === 'unmerged') {
        changes.conflicted.push(entry)
      } else {
        if (entry.x !== '.') changes.staged.push(entry)
        if (entry.y !== '.') changes.unstaged.push(entry)
      }
    }
    pending.length = 0
  }

  const readEntry = (line) => {
    const kind = line[0]
    if (kind === '?') {
      pending.push({ path: line.slice(2), kind: 'untracked', x: '?', y: '?' })
      return
    }
    if (kind === '1') {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      pending.push({
        kind: 'ordinary',
        path: parts.slice(8).join(' '),
        x: xy[0] ?? '.',
        y: xy[1] ?? '.',
        origPath: null,
      })
      return
    }
    if (kind === '2') {
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      const entry = {
        kind: 'rename',
        path: parts.slice(9).join(' '),
        x: xy[0] ?? '.',
        y: xy[1] ?? '.',
        origPath: null,
      }
      pending.push(entry)
      awaitingOrig = entry
      return
    }
    if (kind === 'u') {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      pending.push({
        kind: 'unmerged',
        path: parts.slice(10).join(' '),
        x: xy[0] ?? '.',
        y: xy[1] ?? '.',
        origPath: null,
      })
      return
    }
    if (kind === '!') return // ignored entry
    // Unknown record: keep the payload rather than dropping a changed file.
    pending.push({ kind: 'ordinary', path: line.slice(2), x: '?', y: '?', origPath: null })
  }

  const records = text.split('\0')
  for (const raw of records) {
    if (raw === '') continue
    let record = raw
    while (record.startsWith('\n')) record = record.slice(1)
    if (record === '') continue

    if (awaitingOrig !== null && !record.startsWith('#')) {
      awaitingOrig.origPath = record
      awaitingOrig = null
      continue
    }

    if (record.startsWith('#')) {
      const lines = record.split('\n')
      let index = 0
      while (index < lines.length && (lines[index] === '' || lines[index].startsWith('#'))) {
        const line = lines[index]
        if (line.startsWith('# branch.oid ')) {
          const value = line.slice('# branch.oid '.length).trim()
          branch.unborn = value === '(initial)'
          branch.oid = branch.unborn ? null : value
        } else if (line.startsWith('# branch.head ')) {
          const value = line.slice('# branch.head '.length).trim()
          branch.detached = value === '(detached)'
          branch.head = value
        } else if (line.startsWith('# branch.upstream ')) {
          branch.upstream = line.slice('# branch.upstream '.length).trim()
        } else if (line.startsWith('# branch.ab ')) {
          const match = /\+(\d+) -(\d+)/u.exec(line)
          if (match !== null) {
            branch.ahead = Number(match[1])
            branch.behind = Number(match[2])
          }
        }
        index += 1
      }
      for (; index < lines.length; index += 1) {
        if (lines[index] !== '') readEntry(lines[index])
      }
      continue
    }

    readEntry(record)
  }
  flush()
  return { branch, changes }
}

/**
 * Parse `git log` output written with {@link LOG_FORMAT}.
 *
 * @param {string} text raw stdout.
 * @returns {object[]} commits in git order.
 */
export function parseLog(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  return text
    .split(RECORD)
    .map(chunk => chunk.replace(/^\n+|\n+$/gu, ''))
    .filter(chunk => chunk !== '')
    .map(chunk => {
      const parts = chunk.split(FIELD)
      const parents = (parts[2] ?? '').trim()
      return {
        sha: parts[0] ?? '',
        short: parts[1] ?? '',
        parents: parents === '' ? [] : parents.split(' '),
        author: parts[3] ?? '',
        email: parts[4] ?? '',
        authorTime: parts[5] ?? '',
        commitTime: parts[6] ?? '',
        subject: parts[7] ?? '',
        refs: parseRefs(parts[8] ?? ''),
      }
    })
    .filter(commit => commit.sha !== '')
}

/**
 * Parse the `%D` decoration column into normalized ref names.
 *
 * @param {string} value e.g. `HEAD -> main, origin/main, tag: v1.0`.
 * @returns {{name: string, type: 'head'|'local'|'remote'|'tag', current: boolean}[]}
 */
export function parseRefs(value) {
  if (typeof value !== 'string' || value.trim() === '') return []
  const refs = []
  for (const raw of value.split(',')) {
    const name = raw.trim()
    if (name === '') continue
    if (name.startsWith('tag: ')) {
      refs.push({ name: name.slice(5).trim(), type: 'tag', current: false })
      continue
    }
    if (name.startsWith('HEAD -> ')) {
      refs.push({ name: name.slice(8).trim(), type: 'head', current: true })
      continue
    }
    if (name === 'HEAD' || name.endsWith('/HEAD')) continue
    refs.push({ name, type: name.includes('/') ? 'remote' : 'local', current: false })
  }
  return refs
}

/** The `--pretty` shape {@link parseLog} consumes. */
export const LOG_FORMAT = `--pretty=format:%H${FIELD}%h${FIELD}%P${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%cI${FIELD}%s${FIELD}%D${RECORD}`

/**
 * Parse `git <show|diff-tree> --name-status` rows.
 *
 * @param {string} text raw stdout.
 * @returns {{status: string, path: string, origPath: string|null}[]}
 */
export function parseNameStatus(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const rows = []
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/\r$/u, '')
    if (trimmed.trim() === '') continue
    const fields = trimmed.split('\t')
    if (fields.length < 2) continue
    const status = fields[0].trim()
    if (status === '' || status === 'status') continue
    if (fields.length >= 3) {
      rows.push({ status, path: fields[2], origPath: fields[1] })
    } else {
      rows.push({ status, path: fields[1], origPath: null })
    }
  }
  return rows
}

/**
 * Parse `git <show> --numstat` rows.
 *
 * @param {string} text raw stdout.
 * @returns {Map<string, {additions: number|null, deletions: number|null}>}
 */
export function parseNumstat(text) {
  const stats = new Map()
  if (typeof text !== 'string' || text.trim() === '') return stats
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/\r$/u, '')
    if (trimmed.trim() === '') continue
    const fields = trimmed.split('\t')
    if (fields.length < 3) continue
    const restore = /^(.*)\{[^}]*=>\s*([^}]*)\}(.*)$/u.exec(fields[2] ?? '')
    const file = restore === null ? fields[2] : `${restore[1]}${restore[2].replace(/^\s+|\s+$/gu, '')}${restore[3]}`
    const additions = fields[0] === '-' ? null : Number(fields[0])
    const deletions = fields[1] === '-' ? null : Number(fields[1])
    stats.set(file, {
      additions: Number.isFinite(additions) ? additions : null,
      deletions: Number.isFinite(deletions) ? deletions : null,
    })
  }
  return stats
}

/**
 * Parse `git for-each-ref` rows written with {@link BRANCH_FORMAT}.
 *
 * @param {string} text raw stdout.
 * @returns {object[]} branches, local first then remote.
 */
export function parseBranches(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const branches = []
  for (const line of text.split('\n')) {
    const trimmed = line.replace(/\r$/u, '')
    if (trimmed.trim() === '') continue
    const [short = '', refname = '', head = '', upstream = '', committed = ''] = trimmed.split(FIELD)
    // `%(refname:short)` renders `refs/remotes/origin/HEAD` as `origin`, so the
    // symbolic default-branch ref must be dropped by its full name.
    if (short === '' || refname.endsWith('/HEAD')) continue
    const remote = refname.startsWith('refs/remotes/')
    branches.push({
      name: short,
      refName: refname,
      type: remote ? 'remote' : 'local',
      current: head.trim() === '*',
      upstream: upstream.trim(),
      commitTime: committed.trim(),
    })
  }
  return branches
}

/** The `--format` shape {@link parseBranches} consumes. */
export const BRANCH_FORMAT = `--format=%(refname:short)${FIELD}%(refname)${FIELD}%(HEAD)${FIELD}%(upstream:short)${FIELD}%(committerdate:iso-strict)`

/* ------------------------------------------------------------------ *
 * Worktrees
 * ------------------------------------------------------------------ */

/**
 * Parse `git worktree list --porcelain`.
 *
 * One block per worktree, blocks separated by a blank line, one `key [value]`
 * per line. The main working tree is always first, and every other entry is
 * either on a branch or detached. `locked` / `prunable` are optional and may or
 * may not carry a reason, so the value separates "not flagged" (null) from
 * "flagged with no reason" ('').
 *
 * @param {string} text raw stdout.
 * @returns {{path: string, branch: string|null, head: string, detached: boolean, bare: boolean, locked: string|null, prunable: string|null}[]}
 */
export function parseWorktrees(text) {
  if (typeof text !== 'string' || text === '') return []
  const worktrees = []
  let entry = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/u, '')
    if (line === '') {
      // A blank line closes the current block; the next `worktree` opens a new one.
      entry = null
      continue
    }
    // A worktree path may contain spaces, so only the first space splits the line.
    const space = line.indexOf(' ')
    const key = space === -1 ? line : line.slice(0, space)
    const value = space === -1 ? '' : line.slice(space + 1)
    if (key === 'worktree') {
      if (value === '') continue
      entry = { path: value, branch: null, head: '', detached: false, bare: false, locked: null, prunable: null }
      worktrees.push(entry)
      continue
    }
    // Every other key only means something inside a block that already opened.
    if (entry === null) continue
    if (key === 'HEAD') entry.head = value
    else if (key === 'branch') entry.branch = value.startsWith('refs/heads/') ? value.slice(11) : value
    else if (key === 'detached') entry.detached = true
    else if (key === 'bare') entry.bare = true
    else if (key === 'locked') entry.locked = value
    else if (key === 'prunable') entry.prunable = value
  }
  return worktrees
}

/**
 * Attach the worktree that holds each local branch to that branch's row.
 *
 * `git switch` refuses a branch another worktree has checked out, so the panel
 * needs the same fact before it offers the button. Remote branches carry no
 * such state and are returned untouched, which keeps their shape as it was.
 *
 * @param {object[]} branches from {@link parseBranches}.
 * @param {object[]} worktrees from {@link parseWorktrees}.
 * @param {string} root the repository root this snapshot was read at.
 * @returns {object[]} branches with `worktreePath` and `worktreeCurrent` added.
 */
export function annotateBranches(branches, worktrees, root) {
  const holders = new Map()
  for (const worktree of Array.isArray(worktrees) ? worktrees : []) {
    if (worktree.branch === null || worktree.bare === true) continue
    holders.set(worktree.branch, worktree)
  }
  const here = typeof root === 'string' && root !== '' ? canonicalPath(root) : ''
  const source = Array.isArray(branches) ? branches : []
  return source.map(branch => {
    if (branch.type !== 'local') return branch
    const holder = holders.get(branch.name)
    return {
      ...branch,
      worktreePath: holder === undefined ? null : holder.path,
      worktreeCurrent: holder !== undefined && here !== '' && canonicalPath(holder.path) === here,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Diff helpers
 * ------------------------------------------------------------------ */

/**
 * Whether a patch body should be treated as binary.
 *
 * @param {string} text patch text.
 * @returns {boolean} true when git announced a binary diff or the body has NULs.
 */
export function isBinaryPatch(text) {
  if (typeof text !== 'string' || text === '') return false
  if (/^Binary files .* differ$/mu.test(text) || /^GIT binary patch$/mu.test(text)) return true
  return text.slice(0, 8000).includes('\0')
}

/**
 * Cut a patch to a byte budget without splitting a multi-byte character.
 *
 * @param {string} text patch text.
 * @param {number} limit byte budget.
 * @returns {{patch: string, truncated: boolean, bytes: number}}
 */
export function truncatePatch(text, limit) {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= limit) return { patch: text, truncated: false, bytes }
  // Slice on the byte budget, then drop a dangling replacement character.
  const slice = Buffer.from(text, 'utf8').subarray(0, Math.max(0, limit)).toString('utf8')
  const patch = slice.endsWith('\uFFFD') ? slice.slice(0, -1) : slice
  return { patch, truncated: true, bytes }
}

/**
 * Project raw porcelain entries into the compact shape both callers consume.
 *
 * A file that is both staged and modified again appears in `staged` and in
 * `unstaged`, which is how every git front end shows it: one row per state, not
 * one row per path.
 *
 * @param {{staged: object[], unstaged: object[], untracked: object[], conflicted: object[]}} changes
 * @returns {{staged: object[], unstaged: object[], untracked: object[], conflicted: object[]}}
 */
export function presentChanges(changes) {
  const project = (entries, pick) => entries.map(entry => ({
    path: entry.path,
    origPath: entry.origPath ?? null,
    status: pick(entry),
  }))
  return {
    staged: project(changes.staged, entry => entry.x),
    unstaged: project(changes.unstaged, entry => entry.y),
    untracked: project(changes.untracked, () => '?'),
    conflicted: project(changes.conflicted, entry => entry.x === '.' ? 'U' : entry.x),
  }
}

/* ------------------------------------------------------------------ *
 * Workspace targeting
 * ------------------------------------------------------------------ */

/**
 * Normalize one directory for comparison: absolute, no trailing separator.
 *
 * The browser sends a Session's working directory; the registry holds the
 * directory the user opened. Both sides go through this, so a trailing slash or
 * a `.` segment never decides whether a workspace matches.
 *
 * @param {string} value directory path.
 * @returns {string} the normalized path.
 */
export function normalizeDirectory(value) {
  const resolved = path.resolve(value)
  return resolved.length > 1 ? resolved.replace(/[/\\]+$/u, '') : resolved
}

/**
 * Whether `child` is `root` itself or lies somewhere under it.
 *
 * @param {string} root normalized workspace root.
 * @param {string} child normalized directory.
 * @returns {boolean} containment.
 */
export function directoryContains(root, child) {
  if (child === root) return true
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  return child.startsWith(prefix)
}

/**
 * Canonical form of a path that may not exist yet.
 *
 * git prints back the path it was handed, while a workspace can reach the same
 * place through a symlinked prefix (`/var` versus `/private/var` on macOS). The
 * existing prefix of a path is therefore resolved through symlinks and the rest
 * is appended verbatim, so two spellings of one directory compare equal — even
 * for a worktree directory that has not been created yet, which is exactly the
 * comparison the containment checks need.
 *
 * @param {string} value path, existing or not.
 * @returns {string} the canonical path.
 */
function canonicalPath(value) {
  const normalized = normalizeDirectory(value)
  const tail = []
  let current = normalized
  for (;;) {
    try {
      const resolved = normalizeDirectory(realpathSync.native(current))
      return tail.length === 0 ? resolved : normalizeDirectory(path.join(resolved, ...tail))
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return normalized
      tail.unshift(path.basename(current))
      current = parent
    }
  }
}

/**
 * Render one worktree path for a narrow sidebar.
 *
 * Inside the repository the path is relative to its root, which is the only form
 * that fits in a column this narrow; outside it falls back to a `~`-abbreviated
 * home path so a worktree kept next to the repository stays readable.
 *
 * @param {string} target worktree path as git printed it.
 * @param {string} root repository root.
 * @returns {string} the printable path.
 */
export function displayPathOf(target, root) {
  if (typeof target !== 'string' || target === '') return ''
  const resolved = normalizeDirectory(target)
  if (typeof root === 'string' && root !== '') {
    const base = normalizeDirectory(root)
    if (directoryContains(base, resolved)) {
      return resolved === base ? '.' : resolved.slice(base.length + 1)
    }
  }
  try {
    const home = normalizeDirectory(homedir())
    if (home !== '' && directoryContains(home, resolved)) return `~${resolved.slice(home.length)}`
  } catch {
    // No home directory in this environment: the absolute path is still correct.
  }
  return resolved
}

/**
 * Project raw worktree records into the shape the panel consumes.
 *
 * @param {object[]} worktrees from {@link parseWorktrees}.
 * @param {string} root the repository root this snapshot was read at.
 * @returns {object[]} worktrees with display, `current`, and `main` markers.
 */
export function presentWorktrees(worktrees, root) {
  const here = typeof root === 'string' && root !== '' ? canonicalPath(root) : ''
  const source = Array.isArray(worktrees) ? worktrees : []
  return source.map((worktree, index) => ({
    path: worktree.path,
    displayPath: displayPathOf(worktree.path, root),
    branch: worktree.branch ?? null,
    head: typeof worktree.head === 'string' ? worktree.head.slice(0, 7) : '',
    detached: worktree.detached === true,
    bare: worktree.bare === true,
    locked: worktree.locked ?? null,
    prunable: worktree.prunable ?? null,
    current: here !== '' && canonicalPath(worktree.path) === here,
    main: index === 0,
  }))
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

/** Default limits; `index.js` overrides them from the row config. */
const DEFAULTS = {
  maxCommits: 200,
  maxDiffBytes: 400000,
  commandTimeoutMs: 15000,
  maxCommitFiles: 400,
}

/** Where a worktree goes when the caller names no path: the agent tool's own home. */
const WORKTREE_DIR = path.join('.agents', 'worktrees')

/**
 * Create the Git service.
 *
 * @param {object} options service options.
 * @param {(args: string[], options?: object) => Promise<{stdout: string, stderr: string, code: number}>} [options.run] injectable runner (tests).
 * @param {() => {id: string, title?: string, path: string}[]} options.workspaces workspace registry reader.
 * @param {object} [options.config] resolved plugin config.
 * @returns {object} the service.
 */
export function createGitService(options) {
  const config = { ...DEFAULTS, ...(options.config ?? {}) }
  const run = options.run ?? createRunner({ timeoutMs: config.commandTimeoutMs })
  const readWorkspaces = options.workspaces

  /**
   * Resolve the workspace a request targets, or throw a structured error.
   *
   * A `dir` — a Session's working directory, as the browser knows it — wins over
   * an id, because that is the only address that follows a Session. It is never
   * used as a git cwd directly: it only selects a registration, and the git
   * commands still run in that registration's own path.
   *
   * @param {string} [workspaceId] workspace registry id.
   * @param {string} [dir] absolute directory to match against the registry.
   * @returns {{id: string, title?: string, path: string}} the target workspace.
   * @throws {GitError} `no_workspace`, `outside_workspace`, or `unknown_workspace`.
   */
  const pickWorkspace = (workspaceId, dir) => {
    const list = readWorkspaces()
    if (list.length === 0) throw new GitError('no_workspace', 'no DSH workspace is registered')
    if (typeof dir === 'string' && dir.trim() !== '') {
      const wanted = normalizeDirectory(dir)
      let best
      for (const entry of list) {
        if (typeof entry.path !== 'string' || entry.path === '') continue
        const root = normalizeDirectory(entry.path)
        if (!directoryContains(root, wanted)) continue
        // Nested workspaces: the deepest registration owns the directory.
        if (best === undefined || root.length > best.root.length) best = { entry, root }
      }
      if (best === undefined) {
        throw new GitError(
          'outside_workspace',
          'the requested directory is not inside any registered DSH workspace',
          { dir: wanted },
        )
      }
      return best.entry
    }
    if (typeof workspaceId === 'string' && workspaceId !== '') {
      const found = list.find(entry => entry.id === workspaceId)
      if (found === undefined) throw new GitError('unknown_workspace', `unknown workspace id: ${workspaceId}`)
      return found
    }
    // Nothing named a workspace: the registry's own order decides, and the panel
    // never depends on it because it always sends its Session's directory.
    return list[0]
  }

  /** The repo facts for one workspace, or `{isRepo:false}` with a reason. */
  const resolveRepo = async (workspace, signal) => {
    let root
    try {
      const result = await run(['rev-parse', '--show-toplevel'], { cwd: workspace.path, signal })
      root = result.stdout.trim()
    } catch (error) {
      const detail = error instanceof GitError ? error.message : String(error)
      if (!existsSync(workspace.path)) {
        return { isRepo: false, reason: 'missing', message: 'the workspace directory does not exist' }
      }
      return { isRepo: false, reason: 'not_a_repo', message: detail }
    }
    if (root === '') {
      return { isRepo: false, reason: 'not_a_repo', message: 'git reported no work tree' }
    }
    return { isRepo: true, root, name: path.basename(root) }
  }

  /** `git rev-parse --verify HEAD` succeeding is the only proof of a commit. */
  const hasCommit = async (root, signal) => {
    try {
      await run(['rev-parse', '--verify', 'HEAD'], { cwd: root, signal })
      return true
    } catch {
      return false
    }
  }

  const readStatus = async (root, signal) => {
    const result = await run(['status', '--porcelain=v2', '--branch', '-z'], { cwd: root, signal })
    return parsePorcelainV2(result.stdout)
  }

  const readBranches = async (root, signal) => {
    const result = await run(
      ['for-each-ref', BRANCH_FORMAT, 'refs/heads', 'refs/remotes'],
      { cwd: root, signal },
    )
    return parseBranches(result.stdout).sort((left, right) => {
      if (left.type !== right.type) return left.type === 'local' ? -1 : 1
      if (left.current !== right.current) return left.current ? -1 : 1
      return left.name.localeCompare(right.name)
    })
  }

  const readWorktrees = async (root, signal) => {
    const result = await run(['worktree', 'list', '--porcelain'], { cwd: root, signal })
    return parseWorktrees(result.stdout)
  }

  /**
   * Detect a history operation git left in progress.
   *
   * The panel writes no conflict resolution UI, so a repository that is already
   * mid-merge or mid-rebase cannot accept another history action: starting a
   * second one would either be refused by git after the fact or, worse, mix two
   * operations. `rev-parse --absolute-git-dir` resolves the git directory of the
   * worktree itself — a linked worktree keeps its state under
   * `.git/worktrees/<name>`, not in the main checkout — and the markers are the
   * same files git consults before it lets an operation start.
   *
   * Rebase is checked first: its sequencer reuses `CHERRY_PICK_HEAD`, so a
   * rebase would otherwise be reported as a cherry-pick.
   *
   * @param {string} root repository root.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<'merge'|'rebase'|'cherry-pick'|'revert'|null>} the operation, when one is running.
   */
  const readOperation = async (root, signal) => {
    let gitDir
    try {
      const result = await run(['rev-parse', '--absolute-git-dir'], { cwd: root, signal })
      gitDir = result.stdout.trim()
    } catch {
      return null
    }
    if (gitDir === '') return null
    const exists = name => existsSync(path.join(gitDir, name))
    if (exists('rebase-merge') || exists('rebase-apply')) return 'rebase'
    if (exists('MERGE_HEAD')) return 'merge'
    if (exists('CHERRY_PICK_HEAD')) return 'cherry-pick'
    if (exists('REVERT_HEAD')) return 'revert'
    return null
  }

  const readLog = async (root, refs, limit, signal) => {
    const args = ['log', '--no-color', '--date-order', `-n${limit}`, LOG_FORMAT]
    if (refs === 'all') {
      args.push('--all', '--exclude=refs/remotes/*/HEAD')
    }
    const result = await run(args, { cwd: root, signal })
    return parseLog(result.stdout)
  }

  const clampLimit = (value) => {
    const fallback = config.maxCommits
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    return Math.min(500, Math.max(1, Math.trunc(value)))
  }

  /**
   * Everything the panel needs in one round trip.
   *
   * @param {{workspaceId?: string, dir?: string, refs?: 'all'|'head', limit?: number, signal?: AbortSignal}} request
   * @returns {Promise<object>}
   */
  async function state(request = {}) {
    const workspaces = readWorkspaces().map(entry => ({
      id: entry.id,
      title: entry.title ?? path.basename(entry.path),
      path: entry.path,
    }))
    const workspace = pickWorkspace(request.workspaceId, request.dir)
    const repo = await resolveRepo(workspace, request.signal)

    if (repo.isRepo !== true) {
      return {
        workspace: { id: workspace.id, title: workspace.title ?? path.basename(workspace.path), path: workspace.path },
        repo: { ...repo, operation: null },
        workspaces,
        branch: null,
        changes: { staged: [], unstaged: [], untracked: [], conflicted: [] },
        branches: [],
        worktrees: [],
        worktree: null,
        commits: [],
        isEmpty: true,
        limits: publicLimits(),
      }
    }

    // The five reads are independent, so one round of latency covers all of them.
    const [hasHead, status, rawBranches, rawWorktrees, operation] = await Promise.all([
      hasCommit(repo.root, request.signal),
      readStatus(repo.root, request.signal),
      readBranches(repo.root, request.signal),
      readWorktrees(repo.root, request.signal),
      readOperation(repo.root, request.signal),
    ])
    const empty = !hasHead
    const worktrees = presentWorktrees(rawWorktrees, repo.root)
    const branches = annotateBranches(rawBranches, rawWorktrees, repo.root)
    const refs = request.refs === 'head' ? 'head' : 'all'
    const commits = empty ? [] : await readLog(repo.root, refs, clampLimit(request.limit), request.signal)

    return {
      workspace: { id: workspace.id, title: workspace.title ?? path.basename(workspace.path), path: workspace.path },
      repo: { ...repo, isEmpty: empty, operation },
      workspaces,
      branch: status.branch,
      changes: presentChanges(status.changes),
      branches,
      worktrees,
      worktree: worktrees.find(entry => entry.current) ?? null,
      commits,
      isEmpty: empty,
      limits: publicLimits(),
    }
  }

  function publicLimits() {
    return {
      maxCommits: config.maxCommits,
      maxDiffBytes: config.maxDiffBytes,
      refs: config.refs === 'head' ? 'head' : 'all',
    }
  }

  /** Resolve workspace → repo root for a mutating call. */
  const requireRepo = async (workspaceId, signal) => {
    const workspace = pickWorkspace(workspaceId)
    const repo = await resolveRepo(workspace, signal)
    if (repo.isRepo !== true) {
      throw new GitError(repo.reason === 'missing' ? 'missing_workspace' : 'not_a_repo', repo.message)
    }
    return { workspace, root: repo.root }
  }

  /**
   * Refuse a history action while git is already in the middle of one.
   *
   * A conflict resolution is not something this panel can finish, so a second
   * action started on top of a stopped merge or rebase would only deepen the
   * state the user has to clean up outside the panel.
   *
   * @param {string} root repository root.
   * @param {AbortSignal} [signal] caller cancellation.
   */
  const requireIdle = async (root, signal) => {
    const operation = await readOperation(root, signal)
    if (operation !== null) {
      throw new GitError(
        'repository_busy',
        `the repository is in the middle of a ${operation}; finish or abort it first`,
        { operation },
      )
    }
  }

  /**
   * Require HEAD to be a commit on a branch.
   *
   * Every history rewrite below moves a branch pointer, and there is no branch
   * to move while HEAD is detached or the repository has no first commit.
   *
   * @param {object} status parsed `git status`.
   * @returns {string} the checked-out branch name.
   */
  const requireAttached = (status) => {
    if (status.branch.unborn === true) {
      throw new GitError('no_commit', 'the repository has no commits yet')
    }
    if (status.branch.detached === true) {
      throw new GitError('detached_head', 'HEAD is detached; check out a branch first')
    }
    return status.branch.head
  }

  /**
   * Refuse history actions on a dirty index or worktree.
   *
   * Untracked files are deliberately not counted: they are ordinary build
   * output, git itself refuses only when one of them would be overwritten, and a
   * refused command exits before any operation state is written.
   *
   * @param {object} status parsed `git status`.
   */
  const requireCleanTracked = (status) => {
    if (status.changes.staged.length > 0 || status.changes.unstaged.length > 0) {
      throw new GitError('worktree_dirty', 'the working tree has staged or unstaged changes')
    }
  }

  /**
   * Resolve a browser-named branch to the full ref git should act on.
   *
   * The panel lists short names, so an unqualified `origin/main` is ambiguous
   * when a local branch of that name exists. The row's own `type` narrows the
   * match, and the command always receives `%(refname)` rather than the short
   * name, which is what makes the two unambiguous.
   *
   * @param {string} root repository root.
   * @param {unknown} name short branch name from the browser.
   * @param {unknown} type `local` | `remote` when the caller knows it.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<{name: string, refName: string, type: string, current: boolean}>} the matching ref.
   */
  const findBranchRef = async (root, name, type, signal) => {
    const wanted = typeof name === 'string' ? name.trim() : ''
    if (wanted === '') throw new GitError('invalid_branch', 'branch must be a non-empty string')
    if (wanted.startsWith('-')) throw new GitError('invalid_branch', 'branch must not start with "-"')
    const kind = type === 'local' || type === 'remote' ? type : undefined
    const branches = await readBranches(root, signal)
    const entry = branches.find(branch =>
      branch.name === wanted && (kind === undefined || branch.type === kind))
    if (entry === undefined) throw new GitError('unknown_branch', `no such branch: ${wanted}`)
    return entry
  }

  /**
   * Resolve a commit id to its full object name and parents.
   *
   * `assertCommitId` only proves the shape; a well-formed id that names no commit
   * has to be refused here instead of reaching a git command.
   *
   * @param {string} root repository root.
   * @param {unknown} commit abbreviated or full object name.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<{sha: string, parents: string[]}>} the commit facts.
   */
  const requireCommitObject = async (root, commit, signal) => {
    const wanted = assertCommitId(commit)
    let full
    try {
      const verified = await run(['rev-parse', '--verify', `${wanted}^{commit}`], { cwd: root, signal })
      full = verified.stdout.trim()
    } catch (error) {
      // A missing object is a caller error; a broken git or a timeout is not,
      // and must keep its own code instead of masquerading as a bad commit id.
      if (error instanceof GitError && error.code === 'git_failed') {
        throw new GitError('unknown_commit', `no such commit: ${wanted}`, { commit: wanted })
      }
      throw error
    }
    if (full === '') throw new GitError('unknown_commit', `no such commit: ${wanted}`, { commit: wanted })
    const listing = await run(['rev-list', '--parents', '-n', '1', full], { cwd: root, signal })
    const parts = listing.stdout.trim().split(/\s+/u).filter(part => part !== '')
    return { sha: full, parents: parts.slice(1) }
  }

  /**
   * Whether one commit is an ancestor of HEAD.
   *
   * @param {string} root repository root.
   * @param {string} sha commit to look for.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<boolean>} true when HEAD descends from it.
   */
  const isAncestor = async (root, sha, signal) => {
    const result = await run(['merge-base', '--is-ancestor', sha, 'HEAD'], {
      cwd: root,
      signal,
      allowCodes: [1],
    })
    return result.code === 0
  }

  /**
   * Whether a marker proving an aborted operation is still in progress exists.
   *
   * @param {string} root repository root.
   * @param {'merge'|'rebase'|'cherry-pick'|'revert'} kind operation kind.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<boolean>} true when git would need `--abort`.
   */
  const operationInProgress = async (root, kind, signal) => {
    let gitDir
    try {
      const result = await run(['rev-parse', '--absolute-git-dir'], { cwd: root, signal })
      gitDir = result.stdout.trim()
    } catch {
      return false
    }
    if (gitDir === '') return false
    const has = name => existsSync(path.join(gitDir, name))
    if (kind === 'merge') return has('MERGE_HEAD')
    if (kind === 'rebase') return has('rebase-merge') || has('rebase-apply')
    return has('CHERRY_PICK_HEAD') || has('REVERT_HEAD') || has('sequencer')
  }

  /**
   * Undo a stopped operation so a failure never leaves the repository mid-way.
   *
   * @param {string} root repository root.
   * @param {'merge'|'rebase'|'cherry-pick'|'revert'} kind operation kind.
   * @param {AbortSignal} [signal] caller cancellation.
   * @returns {Promise<boolean>} whether an abort was attempted.
   */
  const abortOperation = async (root, kind, signal) => {
    if (!(await operationInProgress(root, kind, signal))) return false
    const args = kind === 'merge'
      ? ['merge', '--abort']
      : kind === 'rebase'
        ? ['rebase', '--abort']
        : kind === 'cherry-pick'
          ? ['cherry-pick', '--abort']
          : ['revert', '--abort']
    try {
      await run(args, { cwd: root, signal })
    } catch {
      // The original failure is the one worth reporting; an abort that cannot
      // finish is surfaced by the next snapshot read instead.
    }
    return true
  }

  /** The first non-empty line of a thrown failure, for a conflict message. */
  const failureLine = (error) => {
    const text = error instanceof Error ? error.message : String(error)
    return text.split('\n').map(line => line.trim()).find(line => line !== '') ?? ''
  }

  /**
   * One commit's metadata, refs, and changed files.
   *
   * @param {{workspaceId?: string, commit: string, signal?: AbortSignal}} request
   * @returns {Promise<object>}
   */
  async function commitDetail(request) {
    const commit = assertCommitId(request.commit)
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const format = [
      '%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%D', '%B',
    ].join(FIELD)
    const meta = await run(
      ['show', '--no-color', '--no-patch', `--format=${format}${RECORD}`, commit],
      { cwd: root, signal: request.signal },
    )
    const chunk = meta.stdout.replace(/^\n+|\n+$/gu, '')
    const parts = chunk.split(FIELD)
    const message = (parts[10] ?? '').replace(/^\n+|\s+$/gu, '')
    const [nameStatus, numstat] = await Promise.all([
      run(
        ['show', '--no-color', '--name-status', '--format=', '--diff-merges=first-parent', commit],
        { cwd: root, signal: request.signal },
      ),
      run(
        ['show', '--no-color', '--numstat', '--format=', '--diff-merges=first-parent', commit],
        { cwd: root, signal: request.signal },
      ),
    ])
    const stats = parseNumstat(numstat.stdout)
    const files = parseNameStatus(nameStatus.stdout)
      .slice(0, config.maxCommitFiles)
      .map(row => ({
        status: row.status,
        path: row.path,
        origPath: row.origPath,
        additions: stats.get(row.path)?.additions ?? null,
        deletions: stats.get(row.path)?.deletions ?? null,
      }))
    return {
      sha: parts[0] ?? commit,
      short: parts[1] ?? '',
      parents: (parts[2] ?? '').trim() === '' ? [] : (parts[2] ?? '').trim().split(' '),
      author: parts[3] ?? '',
      email: parts[4] ?? '',
      authorTime: parts[5] ?? '',
      committer: parts[6] ?? '',
      committerEmail: parts[7] ?? '',
      commitTime: parts[8] ?? '',
      refs: parseRefs(parts[9] ?? ''),
      message,
      files,
      filesTruncated: files.length >= config.maxCommitFiles,
    }
  }

  /**
   * One patch: a working-tree file, a staged file, or a file inside a commit.
   *
   * @param {{workspaceId?: string, target?: string, path?: string, commit?: string, signal?: AbortSignal}} request
   * @returns {Promise<object>}
   */
  async function diff(request) {
    const target = request.target === 'index' || request.target === 'commit' ? request.target : 'worktree'
    const { root } = await requireRepo(request.workspaceId, request.signal)
    // `git show` prints the commit's own patch; `git diff <commit>` would compare
    // the commit against the working tree instead, which is a different question.
    const args = target === 'commit'
      ? ['show', '--no-color', '--no-ext-diff', '--unified=3', '--format=', '--diff-merges=first-parent']
      : ['diff', '--no-color', '--no-ext-diff', '--unified=3']
    if (target === 'commit') {
      const commit = assertCommitId(request.commit)
      args.push(commit, '--')
    } else if (target === 'index') {
      args.push('--cached', '--')
    } else {
      args.push('--')
    }

    let filePath = null
    if (request.path !== undefined && request.path !== null && request.path !== '') {
      filePath = assertRelativePath(request.path)
      args.push(filePath)
    }

    let stdout
    if (target === 'worktree' && filePath !== null) {
      const status = await readStatus(root, request.signal)
      const untracked = status.changes.untracked.find(entry => entry.path === filePath)
      if (untracked !== undefined) {
        const result = await run(
          ['diff', '--no-color', '--no-index', '--unified=3', '--', '/dev/null', filePath],
          { cwd: root, signal: request.signal, allowCodes: [1] },
        )
        stdout = result.stdout
      }
    }
    if (stdout === undefined) {
      const result = await run(args, { cwd: root, signal: request.signal, allowCodes: [1] })
      stdout = result.stdout
    }

    const binary = isBinaryPatch(stdout)
    const cut = binary ? { patch: '', truncated: false, bytes: Buffer.byteLength(stdout, 'utf8') } : truncatePatch(stdout, config.maxDiffBytes)
    return {
      target,
      path: filePath,
      binary,
      truncated: cut.truncated,
      bytes: cut.bytes,
      patch: cut.patch,
    }
  }

  /** Reject a path that the current status does not report. */
  const requireKnownPath = async (root, paths, signal, kind) => {
    const status = await readStatus(root, signal)
    const known = new Set()
    chooseGroup(status, kind).forEach(entry => known.add(entry.path))
    const unknown = paths.filter(entry => !known.has(entry))
    if (unknown.length > 0) {
      throw new GitError('unknown_path', `not an ${kind} path: ${unknown.join(', ')}`, { paths: unknown })
    }
    return status
  }

  const chooseGroup = (status, kind) => {
    if (kind === 'untracked') return status.changes.untracked
    if (kind === 'staged') return status.changes.staged
    return status.changes.unstaged
  }

  /**
   * Stage paths.
   *
   * @param {{workspaceId?: string, paths: string[]|string, signal?: AbortSignal}} request
   * @returns {Promise<{staged: string[]}>}
   */
  async function stage(request) {
    const paths = assertPathList(request.paths)
    const { root } = await requireRepo(request.workspaceId, request.signal)
    await run(['add', '-A', '--', ...paths], { cwd: root, signal: request.signal })
    return { staged: paths }
  }

  /**
   * Unstage paths, tolerating a repository whose HEAD does not exist yet.
   *
   * @param {{workspaceId?: string, paths: string[]|string, signal?: AbortSignal}} request
   * @returns {Promise<{unstaged: string[]}>}
   */
  async function unstage(request) {
    const paths = assertPathList(request.paths)
    const { root } = await requireRepo(request.workspaceId, request.signal)
    try {
      await run(['restore', '--staged', '--', ...paths], { cwd: root, signal: request.signal })
    } catch {
      // An unborn repository has nothing to restore from; drop the index entry.
      await run(['rm', '--cached', '--quiet', '--ignore-unmatch', '--', ...paths], {
        cwd: root,
        signal: request.signal,
      })
    }
    return { unstaged: paths }
  }

  /**
   * Discard local changes for tracked paths; delete untracked files only when
   * the caller confirmed and the path is genuinely untracked right now.
   *
   * @param {{workspaceId?: string, paths: string[]|string, confirm?: boolean, signal?: AbortSignal}} request
   * @returns {Promise<{discarded: string[], removed: string[], restored: string[]}>}
   */
  async function discard(request) {
    const paths = assertPathList(request.paths)
    if (request.confirm !== true) {
      throw new GitError('confirm_required', 'discarding changes requires confirm: true')
    }
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const status = await readStatus(root, request.signal)
    const untracked = new Set(status.changes.untracked.map(entry => entry.path))
    const tracked = new Set([...status.changes.staged, ...status.changes.unstaged].map(entry => entry.path))
    const unknown = paths.filter(entry => !untracked.has(entry) && !tracked.has(entry))
    if (unknown.length > 0) {
      throw new GitError('unknown_path', `not a changed path: ${unknown.join(', ')}`, { paths: unknown })
    }

    const toClean = paths.filter(entry => untracked.has(entry))
    const toRestore = paths.filter(entry => tracked.has(entry))

    if (toRestore.length > 0) {
      await run(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...toRestore], {
        cwd: root,
        signal: request.signal,
      })
    }
    if (toClean.length > 0) {
      await run(['clean', '-f', '-d', '--', ...toClean], { cwd: root, signal: request.signal })
    }
    return { discarded: toRestore, removed: toClean, restored: [] }
  }

  /**
   * Commit the index, optionally staging paths first.
   *
   * @param {{workspaceId?: string, message: string, paths?: string[]|string, signal?: AbortSignal}} request
   * @returns {Promise<{sha: string, short: string, summary: string}>}
   */
  async function commit(request) {
    if (typeof request.message !== 'string') {
      throw new GitError('invalid_message', 'message must be a string')
    }
    const message = request.message.replace(/\r\n/gu, '\n').trim()
    if (message === '') throw new GitError('invalid_message', 'commit message must not be empty')
    if (message.length > 10000) throw new GitError('invalid_message', 'commit message is too long')

    const { root } = await requireRepo(request.workspaceId, request.signal)
    if (request.paths !== undefined && request.paths !== null) {
      const paths = assertPathList(request.paths)
      await run(['add', '-A', '--', ...paths], { cwd: root, signal: request.signal })
    }
    await run(['commit', '--no-verify', '-m', message], { cwd: root, signal: request.signal })
    const head = await run(['rev-parse', '--short', 'HEAD'], { cwd: root, signal: request.signal })
    const summary = await run(['log', '-1', '--no-color', '--pretty=format:%s'], {
      cwd: root,
      signal: request.signal,
    })
    return {
      sha: (await run(['rev-parse', 'HEAD'], { cwd: root, signal: request.signal })).stdout.trim(),
      short: head.stdout.trim(),
      summary: summary.stdout.trim(),
    }
  }

  /**
   * Switch to an existing local branch.
   *
   * @param {{workspaceId?: string, branch: string, signal?: AbortSignal}} request
   * @returns {Promise<{branch: string}>}
   */
  async function checkout(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const branch = await assertBranchName(run, root, request.branch)
    const branches = await readBranches(root, request.signal)
    if (!branches.some(entry => entry.type === 'local' && entry.name === branch)) {
      throw new GitError('unknown_branch', `no such local branch: ${branch}`)
    }
    // The same branch cannot be checked out twice; git would refuse after the
    // fact with a message the panel cannot turn into a disabled button.
    const holder = (await readWorktrees(root, request.signal)).find(
      entry => entry.branch === branch && entry.bare !== true,
    )
    if (holder !== undefined && canonicalPath(holder.path) !== canonicalPath(root)) {
      throw new GitError(
        'branch_in_worktree',
        `branch ${branch} is already checked out in the worktree at ${holder.path}`,
        { branch, path: holder.path },
      )
    }
    await run(['switch', branch], { cwd: root, signal: request.signal })
    return { branch }
  }

  /**
   * Create a branch at HEAD and switch to it.
   *
   * @param {{workspaceId?: string, branch: string, signal?: AbortSignal}} request
   * @returns {Promise<{branch: string}>}
   */
  async function createBranch(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const branch = await assertBranchName(run, root, request.branch)
    const branches = await readBranches(root, request.signal)
    if (branches.some(entry => entry.type === 'local' && entry.name === branch)) {
      throw new GitError('branch_exists', `branch already exists: ${branch}`)
    }
    await run(['switch', '-c', branch], { cwd: root, signal: request.signal })
    return { branch }
  }

  /**
   * Resolve where a new worktree will be created.
   *
   * The default mirrors what the agent's own worktree tool does —
   * `<workspace>/.agents/worktrees/<branch>` — so both routes land in the same
   * place and the same `.gitignore` marker covers them. A caller-supplied path
   * may be absolute or relative to the workspace, but it has to stay inside the
   * workspace: this service never creates a directory outside the tree the user
   * opened, and never inside git's own bookkeeping.
   *
   * @param {{path: string}} workspace the registered workspace.
   * @param {string} root repository root.
   * @param {string} branch validated branch name.
   * @param {unknown} requested caller-supplied path, if any.
   * @returns {string} the absolute target path.
   */
  const worktreeTarget = (workspace, root, branch, requested) => {
    const asked = typeof requested === 'string' ? requested.trim() : ''
    const base = asked === ''
      ? path.join(workspace.path, WORKTREE_DIR, branch)
      : (path.isAbsolute(asked) ? asked : path.join(workspace.path, asked))
    const target = canonicalPath(base)
    if (!directoryContains(canonicalPath(workspace.path), target)) {
      throw new GitError(
        'invalid_worktree_path',
        `a worktree must stay inside the workspace at ${workspace.path}`,
        { path: target },
      )
    }
    if (directoryContains(canonicalPath(path.join(root, '.git')), target)) {
      throw new GitError('invalid_worktree_path', 'a worktree may not be created inside .git', { path: target })
    }
    return target
  }

  /**
   * Keep the conventional worktree container out of `git status`.
   *
   * A worktree created inside the repository is just a directory as far as the
   * main working tree is concerned, so it would show up as untracked until
   * something ignores it. The agent's worktree tool writes this one-line marker;
   * the panel writes the same file so both routes leave a clean status. The
   * marker always sits at the container (`<workspace>/.agents/worktrees/`), not
   * next to the worktree, because a branch name may nest one level deeper. Any
   * other parent directory belongs to the user and is left alone.
   *
   * @param {{path: string}} workspace the registered workspace.
   * @param {string} target the worktree path that was just created.
   */
  const ensureWorktreeIgnored = (workspace, target) => {
    const container = canonicalPath(path.join(workspace.path, WORKTREE_DIR))
    if (!directoryContains(container, canonicalPath(target))) return
    const marker = path.join(container, '.gitignore')
    if (existsSync(marker)) return
    try {
      writeFileSync(marker, '*\n', 'utf8')
    } catch {
      // A read-only checkout must not fail a worktree that already exists.
    }
  }

  /**
   * Create a worktree, on a branch that is new or already there.
   *
   * @param {{workspaceId?: string, branch: string, path?: string, createBranch?: boolean, base?: string, signal?: AbortSignal}} request
   * @returns {Promise<{path: string, branch: string}>}
   */
  async function createWorktree(request) {
    const { workspace, root } = await requireRepo(request.workspaceId, request.signal)
    const branch = await assertBranchName(run, root, request.branch)
    const target = worktreeTarget(workspace, root, branch, request.path)
    if (existsSync(target)) {
      throw new GitError('worktree_exists', `the target path already exists: ${target}`, { path: target })
    }
    const wantsNewBranch = request.createBranch === true
    const [branches, worktrees] = await Promise.all([
      readBranches(root, request.signal),
      readWorktrees(root, request.signal),
    ])
    const exists = branches.some(entry => entry.type === 'local' && entry.name === branch)
    if (wantsNewBranch && exists) {
      throw new GitError('branch_exists', `branch already exists: ${branch}`, { branch })
    }
    if (!wantsNewBranch && !exists) {
      throw new GitError('unknown_branch', `no such local branch: ${branch}`, { branch })
    }
    // One branch can hold at most one worktree, and git refuses the second one.
    const holder = worktrees.find(entry => entry.branch === branch && entry.bare !== true)
    if (holder !== undefined) {
      throw new GitError(
        'branch_in_worktree',
        `branch ${branch} is already checked out in the worktree at ${holder.path}`,
        { branch, path: holder.path },
      )
    }

    const args = ['worktree', 'add']
    if (wantsNewBranch) args.push('-b', branch)
    args.push(target)
    if (wantsNewBranch) {
      // `base` is a revision, never an option: a leading dash is refused here so
      // it cannot be reinterpreted as one.
      const base = typeof request.base === 'string' ? request.base.trim() : ''
      if (base !== '' && base.startsWith('-')) {
        throw new GitError('invalid_branch', 'base must be a revision, not an option')
      }
      if (base !== '') args.push(base)
    } else {
      args.push(branch)
    }
    await run(args, { cwd: root, signal: request.signal })
    ensureWorktreeIgnored(workspace, target)
    return { path: target, branch }
  }

  /**
   * Remove one linked worktree, never the one this panel reads.
   *
   * The path is matched against git's own list rather than passed through, so a
   * crafted string can never reach `git worktree remove` unvalidated. Removal
   * needs the same explicit confirmation the discard action needs: it deletes a
   * directory, and with `force` it deletes uncommitted work with it.
   *
   * @param {{workspaceId?: string, path: string, confirm?: boolean, force?: boolean, signal?: AbortSignal}} request
   * @returns {Promise<{path: string}>}
   */
  async function removeWorktree(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    if (request.confirm !== true) {
      throw new GitError('confirm_required', 'removing a worktree requires confirm: true')
    }
    if (typeof request.path !== 'string' || request.path.trim() === '') {
      throw new GitError('invalid_worktree_path', 'path must be a non-empty string')
    }
    const wanted = canonicalPath(request.path.trim())
    const worktrees = await readWorktrees(root, request.signal)
    const target = worktrees.find(entry => canonicalPath(entry.path) === wanted)
    if (target === undefined) {
      throw new GitError('unknown_worktree', `no such worktree: ${request.path}`, { path: request.path })
    }
    if (canonicalPath(target.path) === canonicalPath(root)) {
      throw new GitError('worktree_in_use', 'the worktree this panel reads cannot be removed', { path: target.path })
    }
    if (target.main === true || worktrees[0] === target) {
      throw new GitError('worktree_in_use', 'the main worktree cannot be removed', { path: target.path })
    }
    const args = ['worktree', 'remove']
    if (request.force === true) args.push('--force')
    args.push(target.path)
    await run(args, { cwd: root, signal: request.signal })
    return { path: target.path }
  }

  /**
   * Forget worktrees whose directory disappeared, leaving their branches alone.
   *
   * @param {{workspaceId?: string, signal?: AbortSignal}} [request]
   * @returns {Promise<{pruned: true}>}
   */
  async function pruneWorktrees(request = {}) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    await run(['worktree', 'prune'], { cwd: root, signal: request.signal })
    return { pruned: true }
  }

  /**
   * Merge one branch into the checked-out branch.
   *
   * `git merge` without `--ff-only`: a branch that is already contained is a
   * fast-forward, a diverged one gets a merge commit, and `--no-edit` keeps the
   * action from opening an editor the browser has no way to show. A stopped
   * merge is aborted before the failure is rethrown; nothing in this panel can
   * resolve a conflict, and leaving one behind would strand the repository.
   *
   * @param {{workspaceId?: string, branch: string, type?: 'local'|'remote', signal?: AbortSignal}} request
   * @returns {Promise<{branch: string}>}
   */
  async function merge(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const signal = request.signal
    await requireIdle(root, signal)
    const status = await readStatus(root, signal)
    requireAttached(status)
    requireCleanTracked(status)
    const entry = await findBranchRef(root, request.branch, request.type, signal)
    if (entry.current === true) {
      throw new GitError('same_branch', `already on branch ${entry.name}`, { branch: entry.name })
    }
    try {
      await run(['merge', '--no-verify', '--no-edit', entry.refName], { cwd: root, signal })
    } catch (error) {
      const aborted = await abortOperation(root, 'merge', signal)
      if (aborted) throw new GitError('merge_conflict', failureLine(error), { branch: entry.name })
      throw error
    }
    return { branch: entry.name }
  }

  /**
   * Rebase the checked-out branch onto another branch.
   *
   * The default rebase is what the menu promises: replay this branch's own
   * commits on top of the target. Existing merge commits in that range are
   * flattened by git, which is the ordinary behaviour of `git rebase` and is
   * documented as such; a stopped rebase is aborted like a stopped merge.
   *
   * @param {{workspaceId?: string, branch: string, type?: 'local'|'remote', signal?: AbortSignal}} request
   * @returns {Promise<{branch: string}>}
   */
  async function rebase(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const signal = request.signal
    await requireIdle(root, signal)
    const status = await readStatus(root, signal)
    requireAttached(status)
    requireCleanTracked(status)
    const entry = await findBranchRef(root, request.branch, request.type, signal)
    if (entry.current === true) {
      throw new GitError('same_branch', `already on branch ${entry.name}`, { branch: entry.name })
    }
    try {
      await run(['rebase', '--no-verify', entry.refName], { cwd: root, signal })
    } catch (error) {
      const aborted = await abortOperation(root, 'rebase', signal)
      if (aborted) throw new GitError('rebase_conflict', failureLine(error), { branch: entry.name })
      throw error
    }
    return { branch: entry.name }
  }

  /**
   * Apply one commit's patch on top of the checked-out branch.
   *
   * A merge commit cannot be picked without choosing a mainline, and picking
   * HEAD onto itself only produces an empty commit that git stops on, so both
   * are refused before the command runs.
   *
   * @param {{workspaceId?: string, commit: string, signal?: AbortSignal}} request
   * @returns {Promise<{commit: string}>}
   */
  async function cherryPick(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const signal = request.signal
    await requireIdle(root, signal)
    const status = await readStatus(root, signal)
    requireAttached(status)
    requireCleanTracked(status)
    const commit = await requireCommitObject(root, request.commit, signal)
    if (commit.parents.length > 1) {
      throw new GitError('merge_commit', 'a merge commit cannot be cherry-picked', { commit: commit.sha })
    }
    if (status.branch.oid === commit.sha) {
      throw new GitError('same_commit', 'that commit is already HEAD', { commit: commit.sha })
    }
    try {
      await run(['cherry-pick', commit.sha], { cwd: root, signal })
    } catch (error) {
      const aborted = await abortOperation(root, 'cherry-pick', signal)
      if (aborted) throw new GitError('cherry_pick_conflict', failureLine(error), { commit: commit.sha })
      throw error
    }
    return { commit: commit.sha }
  }

  /**
   * Revert one commit on the checked-out branch.
   *
   * Reverting a commit that is not an ancestor of HEAD would produce a patch
   * against a history this branch never had, so it is refused; a revert that
   * conflicts is aborted like every other history action here.
   *
   * @param {{workspaceId?: string, commit: string, signal?: AbortSignal}} request
   * @returns {Promise<{commit: string}>}
   */
  async function revert(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const signal = request.signal
    await requireIdle(root, signal)
    const status = await readStatus(root, signal)
    requireAttached(status)
    requireCleanTracked(status)
    const commit = await requireCommitObject(root, request.commit, signal)
    if (commit.parents.length > 1) {
      throw new GitError('merge_commit', 'a merge commit cannot be reverted without a mainline', {
        commit: commit.sha,
      })
    }
    if (!(await isAncestor(root, commit.sha, signal))) {
      throw new GitError('not_ancestor', 'that commit is not on the current branch', { commit: commit.sha })
    }
    try {
      await run(['revert', '--no-edit', commit.sha], { cwd: root, signal })
    } catch (error) {
      const aborted = await abortOperation(root, 'revert', signal)
      if (aborted) throw new GitError('revert_conflict', failureLine(error), { commit: commit.sha })
      throw error
    }
    return { commit: commit.sha }
  }

  /**
   * Remove one commit from the checked-out branch, keeping its descendants.
   *
   * `git rebase --onto <sha>^ <sha>` replays exactly the commits after the one
   * being dropped, which is the "drop this commit" a graph menu promises. It is
   * also a history rewrite, so it needs the same explicit confirmation the other
   * destructive actions need, and it refuses a range that contains merge commits
   * because the replay would silently flatten them.
   *
   * @param {{workspaceId?: string, commit: string, confirm?: boolean, signal?: AbortSignal}} request
   * @returns {Promise<{commit: string, dropped: true}>}
   */
  async function dropCommit(request) {
    const { root } = await requireRepo(request.workspaceId, request.signal)
    const signal = request.signal
    if (request.confirm !== true) {
      throw new GitError('confirm_required', 'dropping a commit requires confirm: true')
    }
    await requireIdle(root, signal)
    const status = await readStatus(root, signal)
    requireAttached(status)
    requireCleanTracked(status)
    const commit = await requireCommitObject(root, request.commit, signal)
    if (commit.parents.length === 0) {
      throw new GitError('root_commit', 'the first commit cannot be dropped', { commit: commit.sha })
    }
    if (commit.parents.length > 1) {
      throw new GitError('merge_commit', 'a merge commit cannot be dropped', { commit: commit.sha })
    }
    if (!(await isAncestor(root, commit.sha, signal))) {
      throw new GitError('not_ancestor', 'that commit is not on the current branch', { commit: commit.sha })
    }
    if (status.branch.oid !== commit.sha) {
      const merges = await run(['rev-list', '--merges', `${commit.sha}..HEAD`], { cwd: root, signal })
      if (merges.stdout.trim() !== '') {
        throw new GitError('merges_in_range', 'dropping it would rewrite merge commits', { commit: commit.sha })
      }
    }
    try {
      await run(['rebase', '--no-verify', '--onto', `${commit.sha}^`, commit.sha], { cwd: root, signal })
    } catch (error) {
      const aborted = await abortOperation(root, 'rebase', signal)
      if (aborted) throw new GitError('rebase_conflict', failureLine(error), { commit: commit.sha })
      throw error
    }
    return { commit: commit.sha, dropped: true }
  }

  return {
    state,
    commitDetail,
    diff,
    stage,
    unstage,
    discard,
    commit,
    checkout,
    createBranch,
    createWorktree,
    removeWorktree,
    pruneWorktrees,
    merge,
    rebase,
    cherryPick,
    revert,
    dropCommit,
    listWorkspaces: () => readWorkspaces().map(entry => ({
      id: entry.id,
      title: entry.title ?? path.basename(entry.path),
      path: entry.path,
    })),
  }
}
