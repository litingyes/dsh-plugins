/**
 * GitHub access for the Host half: repository discovery, the REST calls the
 * panel needs, and the one rule that decides which agent tools need approval.
 *
 * Three jobs, kept apart from the routes (`api.js`) and from the browser:
 *
 *   1. **Where is the repository?** A Session names its working directory; the
 *      GitHub repository behind it is whatever `origin` points at. That mapping
 *      is `parseRemote` + `repoForDir`, and it is the only reason this plugin
 *      knows anything about a repository the user did not name.
 *   2. **Talk to GitHub.** One `fetch` per endpoint, a fixed timeout, and a
 *      closed set of error codes so the panel can branch on a machine code
 *      instead of parsing prose (`GithubError.code`).
 *   3. **Decide which MCP tools write.** GitHub's remote MCP server returns
 *      `readOnlyHint` annotations, but `@deepseek-ai/dsh-mcp-client` keeps only
 *      name/description/schema, so the hint never reaches this Host. The tool
 *      *name* is therefore the only signal left, which is why `isWriteTool` is
 *      a verb-position rule rather than an exact list: GitHub adds tools, and an
 *      unlisted new writer must still be treated as a writer.
 *
 * No third-party dependency: `node:` built-ins and the platform's `fetch` only.
 *
 * @module @litingyes/dsh-github/github
 */

/** Hosts whose `owner/repo` paths this plugin understands. */
export const GITHUB_HOST = 'github.com'

/**
 * Leading segments that name a mutation. The first segment is the verb in every
 * GitHub MCP tool name that starts with one (`create_pull_request`,
 * `merge_pull_request`, `add_issue_comment`, `push_files`), and checking the
 * first segment only is what keeps `pull_request_read` — whose *second* segment
 * happens to be "request" — on the read side.
 */
const LEADING_WRITE_VERBS = new Set([
  'add',
  'assign',
  'create',
  'delete',
  'dismiss',
  'fork',
  'lock',
  'mark',
  'merge',
  'push',
  'remove',
  'reopen',
  'request',
  'set',
  'submit',
  'unlock',
  'update',
])

/**
 * Trailing segments that name a mutation when the noun leads, as in
 * `issue_write`, `label_write` and `actions_run_trigger`.
 */
const TRAILING_WRITE_SEGMENTS = new Set(['write', 'trigger'])

/** A failure with a machine code the panel branches on. */
export class GithubError extends Error {
  /**
   * @param {string} code stable machine code, e.g. `no_token`.
   * @param {string} message human-facing message.
   * @param {Record<string, unknown>} [detail] extra fields for the panel.
   */
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'GithubError'
    this.code = code
    this.detail = detail
  }
}

/**
 * Decide whether one GitHub MCP tool mutates something.
 *
 * The name is the whole rule: first segment a mutation verb, or last segment
 * `write` / `trigger`. Read tools (`get_me`, `list_commits`, `search_code`,
 * `get_file_contents`, `pull_request_read`) match neither.
 *
 * @param {string} bare tool name without the `mcp__<server>__` prefix.
 * @returns {boolean} true when the call should be treated as a write.
 */
export function isWriteTool(bare) {
  const segments = String(bare).toLowerCase().split('_').filter(Boolean)
  if (segments.length === 0) return false
  if (LEADING_WRITE_VERBS.has(segments[0])) return true
  return TRAILING_WRITE_SEGMENTS.has(segments[segments.length - 1])
}

/**
 * Read one GitHub remote address into its repository identity.
 *
 * Accepted forms, all of which `git remote get-url` produces in practice:
 *   https://github.com/owner/repo(.git)
 *   git@github.com:owner/repo(.git)
 *   ssh://git@github.com(:port)?/owner/repo(.git)
 *   git://github.com/owner/repo(.git)
 *
 * Anything else — another host, a deeper path, an empty string — is `undefined`
 * rather than an error: "this workspace is not a GitHub repository" is an
 * ordinary state the panel shows, not a failure to report.
 *
 * @param {unknown} url remote address.
 * @returns {{owner: string, name: string, fullName: string, webUrl: string} | undefined} identity.
 */
export function parseRemote(url) {
  if (typeof url !== 'string') return undefined
  const text = url.trim()
  if (text === '') return undefined

  let host
  let pathname
  // scp-like syntax (`git@github.com:owner/repo`) is not a URL for `new URL`.
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/u.exec(text)
  if (scp !== null) {
    host = scp[1]
    pathname = scp[2]
  } else {
    let parsed
    try {
      parsed = new URL(text)
    } catch {
      return undefined
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ssh:' && parsed.protocol !== 'git:') {
      return undefined
    }
    host = parsed.hostname
    pathname = parsed.pathname
  }

  if (String(host).toLowerCase() !== GITHUB_HOST) return undefined

  const segments = String(pathname)
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '')
    .replace(/\.git$/u, '')
    .split('/')
  if (segments.length !== 2) return undefined

  const [owner, name] = segments
  if (!/^[A-Za-z0-9._-]+$/u.test(owner) || !/^[A-Za-z0-9._-]+$/u.test(name)) return undefined
  if (owner === '.' || owner === '..' || name === '.' || name === '..') return undefined

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    webUrl: `https://${GITHUB_HOST}/${owner}/${name}`,
  }
}

/**
 * Read a hand-typed `owner/repo` into the same identity `parseRemote` returns.
 *
 * This is the escape hatch for a workspace whose remote is missing or is not
 * GitHub: the user names the repository once, and every request of that panel
 * carries it. It is deliberately not a URL parser — a full address already has
 * `parseRemote`, and accepting both here would invite `https://github.com/…/`
 * into a field that is documented as `owner/repo`.
 *
 * @param {unknown} text typed repository name.
 * @returns {{owner: string, name: string, fullName: string, webUrl: string} | undefined} identity.
 */
export function parseRepoName(text) {
  if (typeof text !== 'string') return undefined
  const trimmed = text.trim()
  const match = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/u.exec(trimmed)
  if (match === null) return undefined
  const [, owner, name] = match
  if (owner === '.' || owner === '..' || name === '.' || name === '..') return undefined
  return { owner, name, fullName: `${owner}/${name}`, webUrl: `https://${GITHUB_HOST}/${owner}/${name}` }
}

/**
 * Resolve the GitHub repository of one working directory.
 *
 * `origin` first, because that is the remote a user means; otherwise the first
 * configured remote, so a clone that renamed its upstream still resolves. The
 * two failures are distinct on purpose: `no_remote` means "this workspace has
 * no remote", `not_github` means "it has one, just not ours".
 *
 * @param {(args: string[], options: {cwd: string}) => Promise<string>} run git runner.
 * @param {string} dir absolute working directory.
 * @returns {Promise<{owner: string, name: string, fullName: string, webUrl: string}>} identity.
 */
export async function repoForDir(run, dir) {
  const git = async args => {
    try {
      return await run(args, { cwd: dir })
    } catch {
      return undefined
    }
  }

  let url = await git(['remote', 'get-url', 'origin'])
  if (url === undefined || url.trim() === '') {
    const listed = await git(['remote'])
    const first = typeof listed === 'string' ? listed.split('\n').map(line => line.trim()).find(Boolean) : undefined
    if (first === undefined) throw new GithubError('no_remote', 'this workspace has no git remote')
    url = await git(['remote', 'get-url', first])
    if (url === undefined || url.trim() === '') {
      throw new GithubError('no_remote', 'this workspace has no git remote')
    }
  }

  const repository = parseRemote(url)
  if (repository === undefined) {
    throw new GithubError('not_github', 'this workspace is not a GitHub repository', { remote: url.trim() })
  }
  return repository
}

/** Read `Link` for a next page; the only pagination signal GitHub gives. */
function hasNextPage(link) {
  if (typeof link !== 'string') return false
  return /rel="next"/u.test(link)
}

/** `x-ratelimit-reset` is seconds since the epoch; the panel shows local time. */
function resetAtOf(headers) {
  const raw = headers.get('x-ratelimit-reset')
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return new Date(seconds * 1000).toISOString()
}

/** Keep one user object to the fields the panel draws. */
function trimUser(user) {
  if (user === null || typeof user !== 'object') return ''
  return typeof user.login === 'string' ? user.login : ''
}

/** Labels, minus everything the panel does not render. */
function trimLabels(labels) {
  if (!Array.isArray(labels)) return []
  const out = []
  for (const label of labels) {
    if (label === null || typeof label !== 'object') continue
    const name = typeof label.name === 'string' ? label.name : ''
    if (name === '') continue
    out.push({ name, color: typeof label.color === 'string' ? label.color : '' })
  }
  return out
}

/** One issue or pull request, as the list renders it. */
function trimIssue(issue) {
  return {
    number: Number(issue.number) || 0,
    title: typeof issue.title === 'string' ? issue.title : '',
    state: typeof issue.state === 'string' ? issue.state : 'open',
    author: trimUser(issue.user),
    labels: trimLabels(issue.labels),
    comments: Number(issue.comments) || 0,
    updatedAt: typeof issue.updated_at === 'string' ? issue.updated_at : '',
    webUrl: typeof issue.html_url === 'string' ? issue.html_url : '',
    isPull: typeof issue.pull_request === 'object' && issue.pull_request !== null,
  }
}

/** One pull request, as the list renders it. */
function trimPull(pull) {
  return {
    number: Number(pull.number) || 0,
    title: typeof pull.title === 'string' ? pull.title : '',
    state: typeof pull.state === 'string' ? pull.state : 'open',
    draft: pull.draft === true,
    author: trimUser(pull.user),
    headRef: typeof pull.head?.ref === 'string' ? pull.head.ref : '',
    baseRef: typeof pull.base?.ref === 'string' ? pull.base.ref : '',
    mergeable: typeof pull.mergeable === 'boolean' ? pull.mergeable : null,
    updatedAt: typeof pull.updated_at === 'string' ? pull.updated_at : '',
    webUrl: typeof pull.html_url === 'string' ? pull.html_url : '',
  }
}

/** One notification, as the list renders it. */
function trimNotification(item) {
  const subject = item.subject ?? {}
  const repo = item.repository ?? {}
  return {
    id: typeof item.id === 'string' ? item.id : '',
    reason: typeof item.reason === 'string' ? item.reason : '',
    unread: item.unread === true,
    title: typeof subject.title === 'string' ? subject.title : '',
    type: typeof subject.type === 'string' ? subject.type : '',
    repoFullName: typeof repo.full_name === 'string' ? repo.full_name : '',
    updatedAt: typeof item.updated_at === 'string' ? item.updated_at : '',
    webUrl: typeof item.url === 'string' ? item.url.replace('api.github.com/repos', 'github.com') : '',
  }
}

/** One comment, as the detail view renders it. */
function trimComment(comment) {
  return {
    id: Number(comment.id) || 0,
    author: trimUser(comment.user),
    body: typeof comment.body === 'string' ? comment.body : '',
    createdAt: typeof comment.created_at === 'string' ? comment.created_at : '',
    webUrl: typeof comment.html_url === 'string' ? comment.html_url : '',
  }
}

/** Actions `POST /action` accepts, and the shape each one needs. */
export const ACTIONS = Object.freeze(['comment', 'close', 'reopen', 'merge', 'create-issue'])

/**
 * Build the GitHub access object the routes call.
 *
 * Every method takes the Session directory, so the panel never has to tell the
 * Host which repository it is looking at: the working directory is the answer.
 * Any method also accepts `repo: "owner/name"` to override that, which is how a
 * workspace with no GitHub remote still gets a panel.
 *
 * @param {object} options construction options.
 * @param {(args: string[], options: {cwd: string}) => Promise<string>} options.run git runner.
 * @param {() => Promise<string | undefined>} options.tokenFor current token, read per request.
 * @param {typeof fetch} [options.fetchImpl] fetch implementation (tests inject one).
 * @param {string} [options.apiBase] REST base; GitHub Enterprise uses another.
 * @param {number} [options.timeoutMs] per-request budget.
 * @param {number} [options.maxItems] page size.
 * @param {number} [options.cacheMs] how long one repository's context is reused.
 * @param {() => number} [options.now] clock, for the cache.
 * @param {string} [options.version] packaged version, sent as the user agent.
 * @returns {object} one method per panel need.
 */
export function createGithub({
  run,
  tokenFor,
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.github.com',
  timeoutMs = 15_000,
  maxItems = 30,
  cacheMs = 60_000,
  now = Date.now,
  version = '0.1.0',
}) {
  const base = String(apiBase).replace(/\/+$/u, '')
  const perPage = Math.min(Math.max(Math.trunc(maxItems) || 30, 1), 100)
  /** owner/repo → { at, value } for `/context` only; lists always go to the wire. */
  const contextCache = new Map()

  /**
   * One authenticated request.
   *
   * The timeout and the caller's signal are combined, so a closed panel aborts
   * the call and a hung upstream cannot pin a route open.
   */
  async function request(path, { method = 'GET', query, body, signal } = {}) {
    const token = await tokenFor()
    if (typeof token !== 'string' || token.trim() === '') {
      throw new GithubError('no_token', 'no GitHub token is configured')
    }

    const url = new URL(`${base}${path}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
    const onAbort = () => controller.abort(signal?.reason)
    if (signal !== undefined) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    const init = {
      method,
      headers: {
        authorization: `Bearer ${token.trim()}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': `dsh-github/${version}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }

    let response
    try {
      response = await fetchImpl(url, init)
    } catch (error) {
      // A caller abort is not a failure the panel should draw; it is a newer
      // request replacing this one.
      if (signal?.aborted === true) throw new GithubError('aborted', 'the request was superseded')
      throw new GithubError('network', 'GitHub could not be reached', {
        reason: typeof error?.message === 'string' ? error.message : 'network error',
      })
    } finally {
      clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    }

    const status = response.status
    if (status === 204) return { data: null, hasMore: false }

    let data = null
    let parsed = true
    try {
      data = await response.json()
    } catch {
      parsed = false
    }

    if (response.ok) {
      if (!parsed && data === null) {
        throw new GithubError('bad_response', 'GitHub returned a response that is not JSON')
      }
      return { data, hasMore: hasNextPage(response.headers.get('link')) }
    }

    const message = typeof data?.message === 'string' ? data.message : `GitHub returned ${status}`
    if (status === 401) throw new GithubError('invalid_token', message)
    if (status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new GithubError('rate_limited', 'the GitHub API rate limit is exhausted', { resetAt: resetAtOf(response.headers) })
    }
    if (status === 429) {
      throw new GithubError('rate_limited', 'the GitHub API rate limit is exhausted', { resetAt: resetAtOf(response.headers) })
    }
    if (status === 404) throw new GithubError('not_found', message)
    if (status === 422) throw new GithubError('invalid_request', message)
    if (status === 405 || status === 409) throw new GithubError('not_mergeable', message)
    throw new GithubError('github_error', message, { status })
  }

  /** The repository of one directory, or the one the caller named. */
  async function repository(dir, override) {
    if (override !== undefined && override !== null && override !== '') {
      const named = parseRepoName(override)
      if (named === undefined) {
        throw new GithubError('bad_request', 'a repository must look like owner/name')
      }
      return named
    }
    if (typeof dir !== 'string' || dir.trim() === '') {
      throw new GithubError('bad_request', 'a working directory is required')
    }
    return repoForDir(run, dir)
  }

  /** The repository of one directory, with the context cache applied. */
  async function cachedContext(dir, override, signal) {
    const repo = await repository(dir, override)
    const hit = contextCache.get(repo.fullName)
    if (hit !== undefined && now() - hit.at < cacheMs) return { repo, context: hit.value }

    const [repoResponse, viewerResponse] = await Promise.all([
      request(`/repos/${repo.owner}/${repo.name}`, { signal }),
      request('/user', { signal }).catch(error => {
        // Identity is decoration: a token that can read the repository but not
        // the user should still draw the panel.
        if (error instanceof GithubError && error.code === 'not_found') return { data: null }
        throw error
      }),
    ])

    const payload = repoResponse.data ?? {}
    const viewer = viewerResponse.data ?? null
    const context = {
      repo: {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        description: typeof payload.description === 'string' ? payload.description : '',
        private: payload.private === true,
        defaultBranch: typeof payload.default_branch === 'string' ? payload.default_branch : '',
        stars: Number(payload.stargazers_count) || 0,
        forks: Number(payload.forks_count) || 0,
        webUrl: typeof payload.html_url === 'string' ? payload.html_url : repo.webUrl,
      },
      viewer:
        viewer === null || typeof viewer !== 'object'
          ? null
          : {
              login: trimUser(viewer),
              avatarUrl: typeof viewer.avatar_url === 'string' ? viewer.avatar_url : '',
            },
    }
    contextCache.set(repo.fullName, { at: now(), value: context })
    return { repo, context }
  }

  return {
    /**
     * Repository identity plus the signed-in user, cached for `cacheMs`.
     *
     * @param {string} dir Session working directory.
     * @param {{signal?: AbortSignal}} [options] cancellation.
     * @returns {Promise<object>} `{ repo, viewer }`.
     */
    async context(dir, options = {}) {
      const { context } = await cachedContext(dir, options.repo, options.signal)
      return context
    },

    /**
     * Issues of the Session's repository.
     *
     * @param {string} dir Session working directory.
     * @param {{state?: string, filter?: string, page?: number, signal?: AbortSignal}} [options] filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    async issues(dir, options = {}) {
      const repo = await repository(dir, options.repo)
      const state = options.state === 'closed' || options.state === 'all' ? options.state : 'open'
      const query = { state, per_page: perPage, page: options.page ?? 1 }
      let path = `/repos/${repo.owner}/${repo.name}/issues`
      if (options.filter === 'assigned' || options.filter === 'created') {
        // `assignee` and `creator` are the REST names for these two filters;
        // `*` means "me", and `/user` is not needed to say it.
        query.assignee = options.filter === 'assigned' ? '*' : undefined
        query.creator = options.filter === 'created' ? '*' : undefined
      }
      const { data, hasMore } = await request(path, { query, signal: options.signal })
      const items = (Array.isArray(data) ? data : [])
        // GitHub returns pull requests through the issues endpoint; the Issues
        // tab is about issues, so they are filtered out here.
        .filter(issue => issue?.pull_request === undefined || issue?.pull_request === null)
        .map(trimIssue)
      return { items, hasMore }
    },

    /**
     * Pull requests of the Session's repository.
     *
     * @param {string} dir Session working directory.
     * @param {{state?: string, page?: number, signal?: AbortSignal}} [options] filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    async pulls(dir, options = {}) {
      const repo = await repository(dir, options.repo)
      const state = options.state === 'closed' || options.state === 'all' ? options.state : 'open'
      const { data, hasMore } = await request(`/repos/${repo.owner}/${repo.name}/pulls`, {
        query: { state, per_page: perPage, page: options.page ?? 1 },
        signal: options.signal,
      })
      const items = (Array.isArray(data) ? data : []).map(trimPull)
      return { items, hasMore }
    },

    /**
     * Notifications of the Session's repository — repository-scoped, because a
     * tab that follows one workspace should not list another project's noise.
     *
     * @param {string} dir Session working directory.
     * @param {{all?: boolean, page?: number, signal?: AbortSignal}} [options] filters.
     * @returns {Promise<{items: object[], hasMore: boolean}>} one page.
     */
    async notifications(dir, options = {}) {
      const repo = await repository(dir, options.repo)
      const { data, hasMore } = await request(`/repos/${repo.owner}/${repo.name}/notifications`, {
        query: { all: options.all === true ? 'true' : 'false', per_page: perPage, page: options.page ?? 1 },
        signal: options.signal,
      })
      const items = (Array.isArray(data) ? data : []).map(trimNotification)
      return { items, hasMore }
    },

    /**
     * One issue or pull request with its comments.
     *
     * @param {string} dir Session working directory.
     * @param {{kind?: string, number: number, signal?: AbortSignal}} options target.
     * @returns {Promise<{item: object, comments: object[]}>} detail.
     */
    async item(dir, options = {}) {
      const repo = await repository(dir, options.repo)
      const number = Number(options.number)
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new GithubError('bad_request', 'a positive issue or pull request number is required')
      }
      const kind = options.kind === 'pull' ? 'pull' : 'issue'
      const [target, comments] = await Promise.all([
        request(`/repos/${repo.owner}/${repo.name}/${kind === 'pull' ? 'pulls' : 'issues'}/${number}`, {
          signal: options.signal,
        }),
        request(`/repos/${repo.owner}/${repo.name}/issues/${number}/comments`, {
          query: { per_page: perPage },
          signal: options.signal,
        }),
      ])
      const raw = target.data ?? {}
      const item =
        kind === 'pull'
          ? {
              ...trimPull(raw),
              body: typeof raw.body === 'string' ? raw.body : '',
              mergeableState: typeof raw.mergeable_state === 'string' ? raw.mergeable_state : '',
              additions: Number(raw.additions) || 0,
              deletions: Number(raw.deletions) || 0,
              comments: Number(raw.comments) || 0,
              labels: trimLabels(raw.labels),
            }
          : {
              ...trimIssue(raw),
              body: typeof raw.body === 'string' ? raw.body : '',
              labels: trimLabels(raw.labels),
            }
      return {
        item: { ...item, isPull: kind === 'pull' },
        comments: (Array.isArray(comments.data) ? comments.data : []).map(trimComment),
      }
    },

    /**
     * Perform one human-initiated write.
     *
     * @param {string} dir Session working directory.
     * @param {{action: string, number?: number, body?: string, title?: string, signal?: AbortSignal}} options action.
     * @returns {Promise<{ok: true, webUrl: string}>} outcome.
     */
    async action(dir, options = {}) {
      const action = options.action
      if (!ACTIONS.includes(action)) {
        throw new GithubError('invalid_action', `unknown action: ${String(action)}`)
      }
      const repo = await repository(dir, options.repo)
      const base = `/repos/${repo.owner}/${repo.name}`
      const number = Number(options.number)
      const needsNumber = action !== 'create-issue'
      if (needsNumber && (!Number.isSafeInteger(number) || number <= 0)) {
        throw new GithubError('bad_request', 'a positive issue or pull request number is required')
      }

      if (action === 'comment') {
        const body = typeof options.body === 'string' ? options.body.trim() : ''
        if (body === '') throw new GithubError('bad_request', 'a comment cannot be empty')
        const { data } = await request(`${base}/issues/${number}/comments`, {
          method: 'POST',
          body: { body },
          signal: options.signal,
        })
        return { ok: true, webUrl: typeof data?.html_url === 'string' ? data.html_url : `${repo.webUrl}/issues/${number}` }
      }

      if (action === 'close' || action === 'reopen') {
        const { data } = await request(`${base}/issues/${number}`, {
          method: 'PATCH',
          body: { state: action === 'close' ? 'closed' : 'open' },
          signal: options.signal,
        })
        return { ok: true, webUrl: typeof data?.html_url === 'string' ? data.html_url : `${repo.webUrl}/issues/${number}` }
      }

      if (action === 'merge') {
        const { data } = await request(`${base}/pulls/${number}/merge`, {
          method: 'PUT',
          body: { merge_method: 'merge' },
          signal: options.signal,
        })
        if (data?.merged !== true) {
          throw new GithubError('not_mergeable', typeof data?.message === 'string' ? data.message : 'the pull request cannot be merged')
        }
        return { ok: true, webUrl: `${repo.webUrl}/pull/${number}` }
      }

      const title = typeof options.title === 'string' ? options.title.trim() : ''
      if (title === '') throw new GithubError('bad_request', 'an issue title is required')
      const { data } = await request(`${base}/issues`, {
        method: 'POST',
        body: { title, body: typeof options.body === 'string' ? options.body : '' },
        signal: options.signal,
      })
      return { ok: true, webUrl: typeof data?.html_url === 'string' ? data.html_url : `${repo.webUrl}/issues` }
    },

    /** Drop the cached context, so the next call re-reads GitHub. */
    forget() {
      contextCache.clear()
    },
  }
}
