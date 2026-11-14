/**
 * Thin client for the Host's `/dsh-github/*` routes.
 *
 * Every call is same-origin, credentialed, and cancellable. A failure carries
 * the Host's machine code so the panel branches on the reason instead of
 * parsing prose, and so a GitHub message reaches the user unedited.
 *
 * @module @litingyes/dsh-github/client/api-client
 */

/** Base of every endpoint. Keep in step with `api.js`. */
const BASE = '/dsh-github'

/** A failed request, tagged with the Host's machine code. */
export class ApiError extends Error {
  /**
   * @param {string} code machine code such as `no_token`.
   * @param {string} message human-facing message.
   * @param {Record<string, unknown> | null} [detail] extra fields the Host attached.
   */
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    // The Host spreads its error detail into the same object that carries the
    // code, so a rate-limit refusal can name the reset time it is about.
    this.detail = detail
  }
}

/**
 * Perform one request and unwrap the envelope.
 *
 * @param {string} path endpoint suffix.
 * @param {object} [options] request options.
 * @param {'GET'|'POST'} [options.method] HTTP method.
 * @param {Record<string, string|number|boolean|undefined>} [options.query] query parameters.
 * @param {unknown} [options.body] JSON body.
 * @param {AbortSignal} [options.signal] caller cancellation.
 * @returns {Promise<object>} the parsed `{ ok: true, ... }` payload.
 */
async function request(path, options = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
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
export function createGithubApi() {
  return {
    /**
     * @param {{signal?: AbortSignal}} [options] cancellation.
     * @returns {Promise<object>} `{ configured, source, writable, importable }`.
     */
    auth(options = {}) {
      return request('/auth', { signal: options.signal })
    },

    /**
     * @param {{signal?: AbortSignal}} [options] cancellation.
     * @returns {Promise<object>} `{ login, scopes }`.
     */
    importGh(options = {}) {
      return request('/auth/import-gh', { method: 'POST', signal: options.signal })
    },

    /**
     * Hand a pasted token to the Host, which verifies it before storing it.
     *
     * @param {{token: string, signal?: AbortSignal}} options the pasted token.
     * @returns {Promise<object>} `{ login, scopes }`.
     */
    saveToken(options) {
      return request('/auth/token', {
        method: 'POST',
        body: { token: options.token },
        signal: options.signal,
      })
    },

    /**
     * @param {{dir: string, signal?: AbortSignal}} options Session directory.
     * @returns {Promise<object>} `{ repo, viewer }`.
     */
    context(options) {
      return request('/context', { query: { dir: options.dir, repo: options.repo }, signal: options.signal })
    },

    /**
     * @param {{dir: string, state?: string, filter?: string, page?: number, signal?: AbortSignal}} options filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    issues(options) {
      return request('/issues', {
        query: { dir: options.dir, repo: options.repo, state: options.state, filter: options.filter, page: options.page },
        signal: options.signal,
      })
    },

    /**
     * @param {{dir: string, state?: string, page?: number, signal?: AbortSignal}} options filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    pulls(options) {
      return request('/pulls', {
        query: { dir: options.dir, repo: options.repo, state: options.state, page: options.page },
        signal: options.signal,
      })
    },

    /**
     * @param {{dir: string, all?: boolean, page?: number, signal?: AbortSignal}} options filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    notifications(options) {
      return request('/notifications', {
        query: { dir: options.dir, repo: options.repo, all: options.all, page: options.page },
        signal: options.signal,
      })
    },

    /**
     * @param {{dir: string, kind: string, number: number, signal?: AbortSignal}} options target.
     * @returns {Promise<{item: object, comments: object[]}>} detail.
     */
    item(options) {
      return request('/item', {
        query: { dir: options.dir, repo: options.repo, kind: options.kind, number: options.number },
        signal: options.signal,
      })
    },

    /**
     * @param {{dir: string, action: string, number?: number, body?: string, title?: string, signal?: AbortSignal}} options action.
     * @returns {Promise<{ok: true, webUrl: string}>} outcome.
     */
    action(options) {
      return request('/action', {
        method: 'POST',
        query: { dir: options.dir, repo: options.repo },
        body: { action: options.action, number: options.number, body: options.body, title: options.title },
        signal: options.signal,
      })
    },
  }
}
