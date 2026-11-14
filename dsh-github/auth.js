/**
 * The credential bridge: one button that turns the `gh` CLI's OAuth token into
 * a DSH credential.
 *
 * Why this exists instead of an OAuth client inside the plugin:
 *
 *   - GitHub's remote MCP server does support OAuth, but its authorization
 *     server is plain `https://github.com/login/oauth`, which publishes no
 *     OAuth metadata and no dynamic client registration. A third-party package
 *     therefore cannot register itself the way the MCP spec assumes; it would
 *     have to ship a GitHub OAuth App's client secret.
 *   - `@deepseek-ai/dsh-mcp-client` only ever sets request headers
 *     (`StreamableHTTPClientTransport(..., { requestInit: { headers } })`), so
 *     whatever token exists must already be a string when the row loads.
 *   - `gh` is a client that *is* registered with GitHub. Its token is an OAuth
 *     token, it is refreshed by `gh`, and it authenticates the MCP endpoint —
 *     verified against `https://api.githubcopilot.com/mcp/`.
 *
 * So this module only moves a token from `gh` into the credential store. The
 * value never enters a log, an error message or a response body: the caller
 * learns the login name, the granted scopes, and nothing else.
 *
 * The import is deliberately a user action, never something that happens while
 * the plugin loads: writing a secret into the user's credential file is the kind
 * of side effect that must be asked for.
 *
 * @module @litingyes/dsh-github/auth
 */

import { GithubError } from './github.js'

/** Default credential name; also the `${credential:…}` reference the row uses. */
export const DEFAULT_CREDENTIAL_REF = 'GITHUB_TOKEN'

/** `gh auth token` must answer quickly; it reads a keyring, not the network. */
const DEFAULT_GH_TIMEOUT_MS = 10_000

/** The header GitHub answers scope questions in. */
const SCOPES_HEADER = 'x-oauth-scopes'

/**
 * Read the token `gh` holds for github.com.
 *
 * @param {{exec: (command: string, args: string[], options: object) => Promise<{stdout: string}>}} options
 *   injected command runner.
 * @param {string} command the gh executable.
 * @param {number} timeoutMs budget for the child process.
 * @returns {Promise<string>} the token, trimmed.
 */
async function readGhToken({ exec, command, timeoutMs }) {
  let result
  try {
    result = await exec(command, ['auth', 'token'], { timeout: timeoutMs, cwd: undefined })
  } catch (error) {
    // ENOENT is "gh is not installed"; anything else is the CLI saying no.
    if (error?.code === 'ENOENT') {
      throw new GithubError('gh_missing', 'the GitHub CLI (gh) is not installed')
    }
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    throw new GithubError('gh_not_logged_in', stderr === '' ? 'gh is not signed in to github.com' : stderr)
  }

  const token = typeof result?.stdout === 'string' ? result.stdout.trim() : ''
  if (token === '') {
    throw new GithubError('gh_not_logged_in', 'gh returned an empty token; run `gh auth login`')
  }
  return token
}

/**
 * Build the credential bridge.
 *
 * @param {object} options construction options.
 * @param {object | undefined} options.credentials the Host `ctx.credentials` service, when composed.
 * @param {string} [options.credentialRef] credential name to read and write.
 * @param {string} [options.ghCommand] gh executable.
 * @param {(command: string, args: string[], options: object) => Promise<{stdout: string}>} options.exec
 *   command runner (injected so tests never spawn a process).
 * @param {typeof fetch} [options.fetchImpl] fetch implementation.
 * @param {string} [options.apiBase] REST base.
 * @param {number} [options.timeoutMs] per-request budget for the verification call.
 * @returns {{describe: () => Promise<object>, importFromGh: () => Promise<object>}} bridge.
 */
export function createAuth({
  getCredentials,
  credentials,
  credentialRef = DEFAULT_CREDENTIAL_REF,
  ghCommand = 'gh',
  exec,
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.github.com',
  timeoutMs = DEFAULT_GH_TIMEOUT_MS,
}) {
  const base = String(apiBase).replace(/\/+$/u, '')

  /**
   * Read the store on every call instead of once at mount. Providers are
   * composed in an order a plugin cannot see; capturing `undefined` during
   * startup is what left the setup card with a dead button on a Host whose
   * credential store was mounted a moment later.
   */
  const store = () => {
    if (typeof getCredentials === 'function') {
      try {
        return getCredentials()
      } catch {
        return undefined
      }
    }
    return credentials
  }

  /** True when this Host has a writable credentials service. */
  const usable = () => {
    const service = store()
    return service !== undefined && service !== null && typeof service.set === 'function'
  }

  /**
   * Ask GitHub who a candidate token belongs to.
   *
   * Verification runs before the write: a revoked or mistyped token must never
   * replace one that works.
   *
   * @param {string} token candidate token.
   * @returns {Promise<{login: string, scopes: string[]}>} who it belongs to.
   */
  async function verify(token) {
    let response
    try {
      response = await fetchImpl(`${base}/user`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'dsh-github/auth',
        },
      })
    } catch (error) {
      throw new GithubError('network', 'GitHub could not be reached to verify the token', {
        reason: typeof error?.message === 'string' ? error.message : 'network error',
      })
    }
    if (response.status === 401) {
      throw new GithubError('invalid_token', 'the token was rejected by GitHub')
    }
    if (!response.ok) {
      throw new GithubError('github_error', `GitHub returned ${response.status} while verifying the token`)
    }

    let login = ''
    try {
      const body = await response.json()
      login = typeof body?.login === 'string' ? body.login : ''
    } catch {
      login = ''
    }

    const scopes = (response.headers.get(SCOPES_HEADER) ?? '')
      .split(',')
      .map(scope => scope.trim())
      .filter(Boolean)

    return { login, scopes }
  }

  return {
    /**
     * Report where a token would come from, without ever returning it.
     *
     * @returns {Promise<{configured: boolean, source?: string, writable: boolean, importable: boolean}>} status.
     */
    async describe() {
      if (!usable()) return { configured: false, writable: false, importable: false }
      let info
      try {
        info = await store().describe(credentialRef)
      } catch {
        info = undefined
      }
      return {
        configured: info?.configured === true,
        // `source` is the provider's own word for where the value came from
        // ("stored", "environment"); the panel shows it verbatim.
        source: typeof info?.source === 'string' ? info.source : undefined,
        writable: info?.writable !== false,
        importable: true,
      }
    },

    /**
     * Import the `gh` token into the credential store.
     *
     * @returns {Promise<{login: string, scopes: string[]}>} who the token belongs to.
     */
    async importFromGh() {
      const service = store()
      if (!usable() || service === undefined || service === null) {
        throw new GithubError('writes_disabled', 'this Host has no credentials service to store a token in')
      }

      const token = await readGhToken({ exec, command: ghCommand, timeoutMs })
      const who = await verify(token)
      await service.set(credentialRef, token)
      return who
    },

    /**
     * Store a token the user pasted, after GitHub confirms it works.
     *
     * @param {unknown} token the pasted value.
     * @returns {Promise<{login: string, scopes: string[]}>} who the token belongs to.
     */
    async saveToken(token) {
      const service = store()
      if (!usable() || service === undefined || service === null) {
        throw new GithubError('writes_disabled', 'this Host has no credentials service to store a token in')
      }
      const value = typeof token === 'string' ? token.trim() : ''
      if (value === '') throw new GithubError('bad_request', 'a GitHub token is required')
      const who = await verify(value)
      await service.set(credentialRef, value)
      return who
    },
  }
}
