/**
 * `@litingyes/dsh-git` HTTP surface.
 *
 * The browser half has no privileged channel of its own: it reads and mutates
 * Git state through this small JSON API, mounted as a prefix route on the
 * Host's web server. Everything it can ask for is a workspace id plus a
 * validated path or ref; the service behind it resolves the id against the
 * Host's workspace registry. `/state` alone also accepts `dir`, the Session's
 * working directory: the right-sidebar tab follows its Session and does not
 * know workspace ids until that first answer arrives.
 *
 * Authorisation runs first and fails closed. A Host without a `connection`
 * service (an embedded runtime with no peer auth plane) is treated as trusted,
 * while a `connection` that throws is treated as unauthenticated.
 *
 * @module @litingyes/dsh-git/api
 */

import { GitError } from './git.js'

/** Mount point of every endpoint below. */
export const API_PREFIX = '/dsh-git'

/** Largest accepted JSON request body. */
const BODY_LIMIT = 64 * 1024

/** Actions the mutating endpoint accepts. */
const ACTIONS = new Set([
  'stage',
  'unstage',
  'discard',
  'commit',
  'checkout',
  'create-branch',
  'create-worktree',
  'remove-worktree',
  'prune-worktrees',
])

/** Machine code → HTTP status. Anything unmapped is a 500. */
const STATUS_BY_CODE = {
  invalid_path: 400,
  invalid_branch: 400,
  invalid_commit: 400,
  invalid_message: 400,
  invalid_worktree_path: 400,
  unknown_workspace: 400,
  outside_workspace: 400,
  unknown_path: 400,
  unknown_branch: 400,
  unknown_worktree: 400,
  branch_exists: 400,
  no_workspace: 400,
  bad_request: 400,
  payload_too_large: 413,
  confirm_required: 409,
  not_a_repo: 409,
  missing_workspace: 409,
  worktree_exists: 409,
  worktree_in_use: 409,
  branch_in_worktree: 409,
  git_missing: 503,
  git_timeout: 504,
  git_failed: 422,
}

/**
 * Write one JSON response.
 *
 * @param {import('node:http').ServerResponse} res response.
 * @param {number} status HTTP status.
 * @param {unknown} payload JSON-serializable body.
 */
function sendJson(res, status, payload) {
  if (res.headersSent) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(body)
}

/** Write one plain-text rejection without leaking any registry contents. */
function sendText(res, status, text) {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

/**
 * Read and parse a JSON body under a byte budget.
 *
 * @param {import('node:http').IncomingMessage} req request.
 * @returns {Promise<Record<string, unknown>>} parsed object.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (chunk) => {
      if (done) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        done = true
        reject(new GitError('payload_too_large', 'request body exceeds 64 KiB'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (done) return
      done = true
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new GitError('bad_request', 'request body must be a JSON object'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new GitError('bad_request', 'request body is not valid JSON'))
      }
    })
    req.on('error', (error) => {
      if (done) return
      done = true
      reject(error)
    })
  })
}

/** Turn an unknown thrown value into a response body plus a status. */
function describeFailure(error) {
  if (error instanceof GitError) {
    return {
      status: STATUS_BY_CODE[error.code] ?? 500,
      body: { ok: false, error: { code: error.code, message: error.message, ...(error.detail ?? {}) } },
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { status: 500, body: { ok: false, error: { code: 'internal', message } } }
}

/** Read a string query parameter, treating empty as absent. */
function queryString(params, name) {
  const value = params.get(name)
  return value === null || value === '' ? undefined : value
}

/**
 * Create the request handler.
 *
 * @param {object} options handler options.
 * @param {object} options.git the service from `git.js`.
 * @param {(req: import('node:http').IncomingMessage) => (number|undefined|null|void)} [options.authorize] rejection status.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createApi(options) {
  const git = options.git
  const authorize = options.authorize

  return async function handler(req, res) {
    if (typeof authorize === 'function') {
      let rejection
      try {
        rejection = authorize(req)
      } catch {
        // An authorizer that cannot answer must never mean "no auth".
        rejection = 401
      }
      if (rejection !== undefined && rejection !== null) {
        sendText(res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
    }

    let url
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'malformed request URL' } })
      return
    }

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    const endpoint = url.pathname
    try {
      if (endpoint === `${API_PREFIX}/api/state`) {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
          return
        }
        const limitParam = queryString(url.searchParams, 'limit')
        const state = await git.state({
          workspaceId: queryString(url.searchParams, 'workspace'),
          // The right-sidebar tab follows its Session, so it names the Session's
          // working directory instead of a workspace id. The service decides
          // whether that directory is a registered workspace.
          dir: queryString(url.searchParams, 'dir'),
          refs: queryString(url.searchParams, 'refs'),
          limit: limitParam === undefined ? undefined : Number(limitParam),
          signal: controller.signal,
        })
        sendJson(res, 200, { ok: true, ...state })
        return
      }

      if (endpoint === `${API_PREFIX}/api/commit`) {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
          return
        }
        const commit = await git.commitDetail({
          workspaceId: queryString(url.searchParams, 'workspace'),
          commit: queryString(url.searchParams, 'commit'),
          signal: controller.signal,
        })
        sendJson(res, 200, { ok: true, commit })
        return
      }

      if (endpoint === `${API_PREFIX}/api/diff`) {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
          return
        }
        const patch = await git.diff({
          workspaceId: queryString(url.searchParams, 'workspace'),
          target: queryString(url.searchParams, 'target'),
          path: queryString(url.searchParams, 'path'),
          commit: queryString(url.searchParams, 'commit'),
          signal: controller.signal,
        })
        sendJson(res, 200, { ok: true, ...patch })
        return
      }

      if (endpoint === `${API_PREFIX}/api/action`) {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
          return
        }
        const body = await readJsonBody(req)
        const action = body.action
        if (typeof action !== 'string' || !ACTIONS.has(action)) {
          throw new GitError('bad_request', `action must be one of ${[...ACTIONS].join(', ')}`)
        }
        const workspaceId = typeof body.workspace === 'string' && body.workspace !== '' ? body.workspace : undefined

        if (action === 'stage') {
          await git.stage({ workspaceId, paths: body.paths, signal: controller.signal })
        } else if (action === 'unstage') {
          await git.unstage({ workspaceId, paths: body.paths, signal: controller.signal })
        } else if (action === 'discard') {
          await git.discard({
            workspaceId,
            paths: body.paths,
            confirm: body.confirm === true,
            signal: controller.signal,
          })
        } else if (action === 'commit') {
          await git.commit({
            workspaceId,
            message: body.message,
            paths: body.paths,
            signal: controller.signal,
          })
        } else if (action === 'checkout') {
          await git.checkout({ workspaceId, branch: body.branch, signal: controller.signal })
        } else if (action === 'create-branch') {
          await git.createBranch({ workspaceId, branch: body.branch, signal: controller.signal })
        } else if (action === 'create-worktree') {
          await git.createWorktree({
            workspaceId,
            branch: body.branch,
            path: body.path,
            createBranch: body.createBranch === true,
            base: body.base,
            signal: controller.signal,
          })
        } else if (action === 'remove-worktree') {
          await git.removeWorktree({
            workspaceId,
            path: body.path,
            confirm: body.confirm === true,
            force: body.force === true,
            signal: controller.signal,
          })
        } else {
          await git.pruneWorktrees({ workspaceId, signal: controller.signal })
        }

        // Every mutation answers with the state it produced, so the panel
        // refreshes in one round trip instead of racing a second read.
        const state = await git.state({
          workspaceId,
          refs: typeof body.refs === 'string' ? body.refs : undefined,
          signal: controller.signal,
        })
        sendJson(res, 200, { ok: true, ...state })
        return
      }

      sendJson(res, 404, { ok: false, error: { code: 'not_found', message: `no route for ${endpoint}` } })
    } catch (error) {
      const failure = describeFailure(error)
      sendJson(res, failure.status, failure.body)
    }
  }
}
