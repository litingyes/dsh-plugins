import assert from 'node:assert/strict'
import test from 'node:test'
import { GithubError, createGithub } from '../github.js'

const REMOTE = 'git@github.com:litingyes/dsh-plugins.git'
const run = async args => {
  if (args.join(' ') === 'remote get-url origin') return `${REMOTE}\n`
  throw new Error(`unexpected git call: ${args.join(' ')}`)
}

const json = (body, options = {}) =>
  new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  })

function makeFetch(handler) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init, calls.length)
  }
  return { fetchImpl, calls }
}

/** A GitHub double that answers the context pair and nothing else. */
function contextFetch(extra = {}) {
  return makeFetch(url => {
    const key = Object.keys(extra).find(fragment => url.includes(fragment))
    if (key !== undefined) return extra[key](url)
    if (url.endsWith('/user')) return json({ login: 'litingyes', avatar_url: 'https://avatars.githubusercontent.com/u/1' })
    if (/\/repos\/litingyes\/dsh-plugins$/u.test(url)) {
      return json({
        description: 'plugins',
        private: false,
        default_branch: 'release',
        stargazers_count: 3,
        forks_count: 1,
        html_url: 'https://github.com/litingyes/dsh-plugins',
      })
    }
    throw new Error(`unexpected request: ${url}`)
  })
}

function create(overrides = {}) {
  const { fetchImpl, calls } = overrides.fetch ?? contextFetch()
  const github = createGithub({
    run,
    tokenFor: async () => overrides.token ?? 'test-token',
    fetchImpl,
    apiBase: 'https://api.github.com',
    timeoutMs: 5_000,
    maxItems: 5,
    cacheMs: overrides.cacheMs ?? 60_000,
    now: overrides.now,
    ...overrides.options,
  })
  return { github, calls }
}

test('every request carries the token, the API version and the user agent', async () => {
  const { github, calls } = create()
  const context = await github.context('/work')
  assert.equal(context.repo.fullName, 'litingyes/dsh-plugins')
  assert.equal(context.repo.defaultBranch, 'release')
  assert.equal(context.repo.stars, 3)
  assert.equal(context.viewer.login, 'litingyes')

  const headers = calls[0].init.headers
  assert.equal(headers.authorization, 'Bearer test-token')
  assert.equal(headers['x-github-api-version'], '2022-11-28')
  assert.match(headers['user-agent'], /^dsh-github\//u)
})

test('a missing token fails before the request is made', async () => {
  const { github, calls } = create({ token: '' })
  await assert.rejects(github.context('/work'), error => {
    assert.ok(error instanceof GithubError)
    assert.equal(error.code, 'no_token')
    return true
  })
  assert.equal(calls.length, 0)
})

test('the context is cached per repository and re-read after the TTL', async () => {
  let clock = 0
  const fetch = contextFetch()
  const { github, calls } = create({ fetch, now: () => clock, cacheMs: 1_000 })

  await github.context('/work')
  const afterFirst = calls.length
  await github.context('/work')
  assert.equal(calls.length, afterFirst, 'a second read inside the TTL must not hit the wire')

  clock = 5_000
  await github.context('/work')
  assert.ok(calls.length > afterFirst, 'an expired cache must re-read')
})

test('issues drop pull requests and map the assigned filter to the REST name', async () => {
  const fetch = makeFetch(url => {
    if (url.includes('/issues')) {
      return json([
        { number: 7, title: 'an issue', state: 'open', user: { login: 'a' }, labels: [{ name: 'bug', color: 'f00' }, null], comments: 2, updated_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/o/r/issues/7' },
        { number: 8, title: 'a pull request', state: 'open', pull_request: { url: 'x' } },
      ])
    }
    return json([])
  })
  const { github, calls } = create({ fetch })

  const page = await github.issues('/work', { filter: 'assigned', state: 'open', page: 2 })
  assert.equal(page.items.length, 1)
  assert.deepEqual(page.items[0], {
    number: 7,
    title: 'an issue',
    state: 'open',
    author: 'a',
    labels: [{ name: 'bug', color: 'f00' }],
    comments: 2,
    updatedAt: '2026-01-01T00:00:00Z',
    webUrl: 'https://github.com/o/r/issues/7',
    isPull: false,
  })

  const requested = new URL(calls[0].url)
  assert.equal(requested.searchParams.get('assignee'), '*')
  assert.equal(requested.searchParams.get('state'), 'open')
  assert.equal(requested.searchParams.get('page'), '2')
  assert.equal(requested.searchParams.get('per_page'), '5')
})

test('a Link header with rel=next is the only pagination signal', async () => {
  const withNext = makeFetch(() =>
    json([{ number: 1, title: 'x' }], { headers: { link: '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"' } }))
  const a = await create({ fetch: withNext }).github.issues('/work')
  assert.equal(a.hasMore, true)

  const withoutNext = makeFetch(() => json([{ number: 1, title: 'x' }], { headers: { link: '<https://api.github.com/x?page=1>; rel="first"' } }))
  const b = await create({ fetch: withoutNext }).github.issues('/work')
  assert.equal(b.hasMore, false)
})

test('HTTP failures become the closed set of machine codes', async () => {
  const cases = [
    { name: 'expired token', response: () => json({ message: 'Bad credentials' }, { status: 401 }), code: 'invalid_token' },
    {
      name: 'rate limit',
      response: () =>
        json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } }),
      code: 'rate_limited',
      detail: { resetAt: new Date(1700000000_000).toISOString() },
    },
    { name: 'missing repository', response: () => json({ message: 'Not Found' }, { status: 404 }), code: 'not_found' },
    { name: 'server error', response: () => json({ message: 'boom' }, { status: 500 }), code: 'github_error' },
  ]

  for (const entry of cases) {
    const fetch = makeFetch(entry.response)
    await assert.rejects(create({ fetch }).github.context('/work'), error => {
      assert.ok(error instanceof GithubError, entry.name)
      assert.equal(error.code, entry.code, entry.name)
      if (entry.detail !== undefined) assert.deepEqual(error.detail, entry.detail, entry.name)
      return true
    })
  }
})

test('a transport failure is a network code, not a crash', async () => {
  const fetch = makeFetch(() => {
    throw new TypeError('fetch failed')
  })
  await assert.rejects(create({ fetch }).github.context('/work'), error => {
    assert.equal(error.code, 'network')
    assert.equal(error.detail.reason, 'fetch failed')
    return true
  })
})

test('one item reads the pull endpoint and the shared comments endpoint', async () => {
  const fetch = makeFetch(url => {
    if (url.includes('/pulls/12')) {
      return json({
        number: 12,
        title: 'a pull request',
        state: 'open',
        draft: true,
        user: { login: 'b' },
        head: { ref: 'feature/x' },
        base: { ref: 'release' },
        body: 'why',
        mergeable: true,
        mergeable_state: 'clean',
        additions: 10,
        deletions: 2,
        html_url: 'https://github.com/o/r/pull/12',
      })
    }
    if (url.includes('/issues/12/comments')) {
      return json([{ id: 1, user: { login: 'c' }, body: 'hi', created_at: '2026-01-02T00:00:00Z', html_url: 'u' }])
    }
    return json({})
  })

  const { github, calls } = create({ fetch })
  const detail = await github.item('/work', { kind: 'pull', number: 12 })
  assert.equal(detail.item.isPull, true)
  assert.equal(detail.item.headRef, 'feature/x')
  assert.equal(detail.item.body, 'why')
  assert.equal(detail.comments.length, 1)
  assert.equal(detail.comments[0].body, 'hi')
  assert.ok(calls.some(call => call.url.includes('/pulls/12')))
  assert.ok(calls.some(call => call.url.includes('/issues/12/comments')))
})

test('merge refusals are not_mergeable, and the other actions build the right call', async () => {
  const refused = makeFetch(() => json({ message: 'Pull Request is not mergeable' }, { status: 405 }))
  await assert.rejects(create({ fetch: refused }).github.action('/work', { action: 'merge', number: 3 }), error => {
    assert.equal(error.code, 'not_mergeable')
    return true
  })

  const accepting = makeFetch(url => {
    if (url.includes('/merge')) return json({ merged: false, message: 'not mergeable yet' })
    return json({ html_url: 'https://github.com/o/r/issues/3' })
  })
  const { github, calls } = create({ fetch: accepting })
  assert.equal((await github.action('/work', { action: 'comment', number: 3, body: '  hello  ' })).ok, true)
  assert.equal(JSON.parse(calls[0].init.body).body, 'hello')

  await github.action('/work', { action: 'close', number: 3 })
  assert.equal(calls[1].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].init.body), { state: 'closed' })

  await assert.rejects(github.action('/work', { action: 'merge', number: 3 }), error => {
    assert.equal(error.code, 'not_mergeable')
    return true
  })
})

test('the action surface rejects bad input before touching the network', async () => {
  const { github, calls } = create()
  await assert.rejects(github.action('/work', { action: 'nuke' }), error => {
    assert.equal(error.code, 'invalid_action')
    return true
  })
  await assert.rejects(github.action('/work', { action: 'comment', number: 1, body: '   ' }), error => {
    assert.equal(error.code, 'bad_request')
    return true
  })
  await assert.rejects(github.action('/work', { action: 'create-issue', title: '' }), error => {
    assert.equal(error.code, 'bad_request')
    return true
  })
  await assert.rejects(github.item('/work', { kind: 'issue', number: 0 }), error => {
    assert.equal(error.code, 'bad_request')
    return true
  })
  assert.equal(calls.length, 0)
})

test('an empty directory is a bad request, not a git call', async () => {
  const { github, calls } = create()
  await assert.rejects(github.issues(''), error => {
    assert.equal(error.code, 'bad_request')
    return true
  })
  assert.equal(calls.length, 0)
})
