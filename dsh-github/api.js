/**
 * `@litingyes/dsh-github` HTTP surface.
 *
 * The browser half has no privileged channel: it reads the Session repository
 * through these JSON routes, mounted as a prefix route on the Host's web
 * server. Authorisation runs first and fails closed — a Host without a
 * `connection` service (an embedded runtime with no peer auth plane) is trusted,
 * while one that throws is treated as unauthenticated.
 *
 * Two rules the routes keep:
 *
 *   - **The working directory is the whole request.** The panel follows its
 *     Session, so it names a directory and the Host decides which repository
 *     that is. No route accepts an `owner/repo` from the browser.
 *   - **Failures carry a machine code.** Every error body is
 *     `{ ok: false, error: { code, message, …detail } }`, so the panel branches
 *     on the reason instead of parsing prose, and an upstream GitHub message
 *     reaches the user unedited.
 *
 * @module @litingyes/dsh-github/api
 */

import { GithubError } from './github.js'

/** Mount point of every endpoint below. */
export const API_PREFIX = '/dsh-github'

/** Largest accepted JSON request body. */
const BODY_LIMIT = 64 * 1024

/** Machine code → HTTP status. Anything unmapped is a 500. */
const STATUS_BY_CODE = {
  bad_request: 400,
  invalid_action: 400,
  invalid_token: 401,
  writes_disabled: 403,
  not_found: 404,
  no_remote: 409,
  not_github: 409,
  no_token: 409,
  not_mergeable: 409,
  gh_not_logged_in: 409,
  invalid_request: 422,
  rate_limited: 429,
  aborted: 499,
  github_error: 502,
  bad_response: 502,
  network: 502,
  gh_missing: 503,
  payload_too_large: 413,
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
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

/** Write one plain-text rejection without leaking anything else. */
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
    req.on('data', chunk => {
      if (done) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        done = true
        reject(new GithubError('payload_too_large', 'request body exceeds 64 KiB'))
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
          reject(new GithubError('bad_request', 'request body must be a JSON object'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new GithubError('bad_request', 'request body is not valid JSON'))
      }
    })
    req.on('error', error => {
      if (done) return
      done = true
      reject(error)
    })
  })
}

/** Turn an unknown thrown value into a response body plus a status. */
function describeFailure(error) {
  if (error instanceof GithubError) {
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
 * Read a positive integer query parameter.
 *
 * @param {URLSearchParams} params query.
 * @param {string} name parameter name.
 * @param {number | undefined} fallback value when absent or unparseable.
 * @returns {number | undefined} parsed value.
 */
function queryInt(params, name, fallback) {
  const raw = queryString(params, name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/**
 * Create the request handler.
 *
 * @param {object} options handler options.
 * @param {object} options.github the service from `github.js`.
 * @param {object} options.auth the bridge from `auth.js`.
 * @param {boolean} [options.panelWrites] whether `POST /action` may run.
 * @param {(req: import('node:http').IncomingMessage) => (number|undefined|null|void)} [options.authorize]
 *   rejection status, from the Host's connection service.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 *   the route handler.
 */
export function createApi(options) {
  const github = options.github
  const auth = options.auth
  const panelWrites = options.panelWrites !== false
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

    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(API_PREFIX)) {
      sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'unknown route' } })
      return
    }
    const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/u, '') || '/'
    const params = url.searchParams
    const dir = queryString(params, 'dir')
    // The escape hatch for a workspace with no GitHub remote: the panel names
    // the repository once and every request carries it.
    const repo = queryString(params, 'repo')

    try {
      if (req.method === 'GET' && route === '/auth') {
        sendJson(res, 200, { ok: true, ...(await auth.describe()) })
        return
      }

      if (req.method === 'POST' && route === '/auth/import-gh') {
        const result = await auth.importFromGh()
        // A fresh token must be used by the next read, not by a cached context
        // that was computed while none was configured.
        if (typeof github.forget === 'function') github.forget()
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (req.method === 'GET' && route === '/context') {
        sendJson(res, 200, { ok: true, ...(await github.context(dir, { repo, signal: abortSignalOf(req) })) })
        return
      }

      if (req.method === 'GET' && route === '/issues') {
        const page = await github.issues(dir, {
          repo,
          state: queryString(params, 'state'),
          filter: queryString(params, 'filter'),
          page: queryInt(params, 'page', 1),
          signal: abortSignalOf(req),
        })
        sendJson(res, 200, { ok: true, ...page })
        return
      }

      if (req.method === 'GET' && route === '/pulls') {
        const page = await github.pulls(dir, {
          repo,
          state: queryString(params, 'state'),
          page: queryInt(params, 'page', 1),
          signal: abortSignalOf(req),
        })
        sendJson(res, 200, { ok: true, ...page })
        return
      }

      if (req.method === 'GET' && route === '/notifications') {
        const page = await github.notifications(dir, {
          repo,
          all: queryString(params, 'all') === '1' || queryString(params, 'all') === 'true',
          page: queryInt(params, 'page', 1),
          signal: abortSignalOf(req),
        })
        sendJson(res, 200, { ok: true, ...page })
        return
      }

      if (req.method === 'GET' && route === '/item') {
        const number = queryInt(params, 'number', undefined)
        const detail = await github.item(dir, {
          repo,
          kind: queryString(params, 'kind'),
          number,
          signal: abortSignalOf(req),
        })
        sendJson(res, 200, { ok: true, ...detail })
        return
      }

      if (req.method === 'POST' && route === '/action') {
        if (!panelWrites) {
          sendJson(res, 403, {
            ok: false,
            error: { code: 'writes_disabled', message: 'this plugin is configured read-only' },
          })
          return
        }
        const body = await readJsonBody(req)
        const result = await github.action(dir, {
          repo,
          action: body.action,
          number: body.number,
          body: body.body,
          title: body.title,
          signal: abortSignalOf(req),
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'unknown route' } })
    } catch (error) {
      const { status, body } = describeFailure(error)
      // A superseded request is not a failure worth drawing; the panel already
      // started a newer one.
      if (status === 499) {
        sendJson(res, 499, body)
        return
      }
      sendJson(res, status, body)
    }
  }
}

/**
 * The request's own cancellation, so a closed tab stops the upstream call.
 *
 * @param {import('node:http').IncomingMessage} req request.
 * @returns {AbortSignal} aborted when the socket closes before the answer.
 */
function abortSignalOf(req) {
  const controller = new AbortController()
  req.on('close', () => {
    if (!req.complete) controller.abort()
  })
  return controller.signal
}
