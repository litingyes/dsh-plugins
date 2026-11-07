/**
 * Thin client for the Host's read-only `/dsh-director/api/*` route.
 *
 * Same-origin, credentialed, cancellable. A failure carries the Host's machine
 * code so the panel can branch on the reason instead of parsing prose.
 *
 * @module @litingyes/dsh-director/client/api-client
 */

/** Base of every endpoint. Keep in step with `api.js`. */
const BASE = '/dsh-director/api'

/** A failed request, tagged with the Host's machine code. */
export class ApiError extends Error {
  /**
   * @param {string} code machine code such as `outside_workspace`.
   * @param {string} message human-facing message.
   */
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/**
 * Perform one request and unwrap the envelope.
 *
 * @param {string} path endpoint suffix.
 * @param {{ method?: 'GET' | 'POST', query?: Record<string, string | undefined>, signal?: AbortSignal }} [options] request.
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
    const message =
      typeof payload?.error?.message === 'string' ? payload.error.message : `HTTP ${response.status}`
    throw new ApiError(code, message)
  }
  return payload
}

/**
 * Build the panel's data access object.
 *
 * @returns {{ state: (options: { dir: string, signal?: AbortSignal }) => Promise<object> }} API.
 */
export function createDirectorApi() {
  return {
    /**
     * Read one Session directory's production plus the Host-side review.
     *
     * @param {{ dir: string, signal?: AbortSignal }} options Session directory.
     * @returns {Promise<object>} snapshot.
     */
    state(options) {
      return request('/state', { query: { dir: options.dir }, signal: options.signal })
    },
  }
}
