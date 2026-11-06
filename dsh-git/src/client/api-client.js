/**
 * Thin client for the Host's `/dsh-git/api/*` routes.
 *
 * Every call is same-origin, credentialed, and cancellable. A failure carries
 * the Host's machine code so the panel can branch on the reason instead of
 * parsing prose, and so a git message reaches the user unedited.
 *
 * @module @litingyes/dsh-git/client/api-client
 */

/** Base of every endpoint. Keep in step with `api.js`. */
const BASE = '/dsh-git/api'

/** A failed request, tagged with the Host's machine code. */
export class ApiError extends Error {
  /**
   * @param {string} code machine code such as `confirm_required`.
   * @param {string} message human-facing message.
   * @param {Record<string, unknown> | null} [detail] extra fields the Host attached.
   */
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    // The Host spreads `GitError.detail` into the same object that carries the
    // code, so a refused worktree action can name the path it is about. Keeping
    // the whole object — rather than the fields known today — means the panel
    // reads a field a future Host adds without another client release.
    this.detail = detail
  }
}

/**
 * Perform one request and unwrap the envelope.
 *
 * @param {string} path endpoint suffix.
 * @param {object} [options] request options.
 * @param {'GET'|'POST'} [options.method] HTTP method.
 * @param {Record<string, string|number|undefined>} [options.query] query parameters.
 * @param {unknown} [options.body] JSON body.
 * @param {AbortSignal} [options.signal] caller cancellation.
 * @returns {Promise<object>} the parsed `{ ok: true, ... }` payload.
 */
async function request(path, options = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  const init = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
  }
  if (options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(options.body)
  }

  let response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('network', `request to ${url.pathname} failed`)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || payload === null || payload.ok !== true) {
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : `http_${response.status}`
    const message = typeof payload?.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
    const detail = typeof payload?.error === 'object' && payload.error !== null ? payload.error : null
    throw new ApiError(code, message, detail)
  }
  return payload
}

/**
 * Build the panel's data access object.
 *
 * @returns {object} one method per endpoint.
 */
export function createGitApi() {
  return {
    /**
     * @param {{workspace?: string, dir?: string, refs?: string, limit?: number, signal?: AbortSignal}} options
     * @returns {Promise<object>} workspace list plus one repository snapshot.
     */
    state(options = {}) {
      return request('/state', {
        query: {
          workspace: options.workspace,
          // The right Sidebar tab names its Session's working directory; the
          // Host decides whether that directory is a registered workspace.
          dir: options.dir,
          refs: options.refs,
          limit: options.limit,
        },
        signal: options.signal,
      })
    },

    /**
     * @param {{workspace?: string, commit: string, signal?: AbortSignal}} options
     * @returns {Promise<object>} `{ commit }`.
     */
    commitDetail(options) {
      return request('/commit', {
        query: { workspace: options.workspace, commit: options.commit },
        signal: options.signal,
      })
    },

    /**
     * @param {{workspace?: string, target: string, path?: string, commit?: string, signal?: AbortSignal}} options
     * @returns {Promise<object>} one patch.
     */
    diff(options) {
      return request('/diff', {
        query: {
          workspace: options.workspace,
          target: options.target,
          path: options.path,
          commit: options.commit,
        },
        signal: options.signal,
      })
    },

    /**
     * @param {{action: string} & Record<string, unknown>} body action payload.
     * @param {AbortSignal} [signal] caller cancellation.
     * @returns {Promise<object>} the state the action produced.
     */
    action(body, signal) {
      return request('/action', { method: 'POST', body, signal })
    },
  }
}
