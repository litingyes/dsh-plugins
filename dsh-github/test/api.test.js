import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { API_PREFIX, createApi } from '../api.js'
import { GithubError } from '../github.js'

/** A request whose body is one JSON document (or nothing). */
function makeReq({ method = 'GET', url = `${API_PREFIX}/context`, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  const req = Readable.from(chunks)
  req.method = method
  req.url = url
  req.headers = {}
  req.complete = true
  return req
}

/** A response that resolves when the handler ends it. */
function makeRes() {
  let finish
  const done = new Promise(resolve => {
    finish = resolve
  })
  const res = {
    statusCode: 0,
    headers: {},
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(payload) {
      this.headersSent = true
      this.raw = payload
      finish(this)
    },
  }
  return { res, done }
}

/** Run one handler call and return the finished response. */
async function call(handler, request) {
  const { res, done } = makeRes()
  await handler(request, res)
  return done
}

/** Each panel need, as the route reaches it. */
function fakeGithub(overrides = {}) {
  const calls = []
  const record = name => async (dir, options) => {
    calls.push({ name, dir, options })
    return { items: [], hasMore: false, repo: { fullName: 'o/r' }, item: { number: 1 }, comments: [] }
  }
  return {
    calls,
    context: async (dir, options) => {
      calls.push({ name: 'context', dir, options })
      return { repo: { fullName: 'o/r' }, viewer: { login: 'me' } }
    },
    issues: record('issues'),
    pulls: record('pulls'),
    notifications: record('notifications'),
    item: record('item'),
    action: async (dir, options) => {
      calls.push({ name: 'action', dir, options })
      return { ok: true, webUrl: 'https://github.com/o/r/issues/1' }
    },
    forget() {
      calls.push({ name: 'forget' })
    },
    ...overrides,
  }
}

const fakeAuth = () => ({
  describe: async () => ({ configured: true, source: 'stored', writable: true, importable: true }),
  importFromGh: async () => ({ login: 'me', scopes: ['repo'] }),
})

test('a rejection from the connection service ends the request before any work', async () => {
  const handler = createApi({ github: fakeGithub(), auth: fakeAuth(), authorize: () => 401 })
  const res = await call(handler, makeReq())
  assert.equal(res.statusCode, 401)
  assert.equal(res.raw, 'unauthorized')
})

test('an authorizer that throws is unauthenticated, never trusted', async () => {
  const handler = createApi({
    github: fakeGithub(),
    auth: fakeAuth(),
    authorize: () => {
      throw new Error('boom')
    },
  })
  const res = await call(handler, makeReq())
  assert.equal(res.statusCode, 401)
})

test('/auth reports the credential status without a token', async () => {
  const handler = createApi({ github: fakeGithub(), auth: fakeAuth() })
  const res = await call(handler, makeReq({ url: `${API_PREFIX}/auth` }))
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.raw), {
    ok: true,
    configured: true,
    source: 'stored',
    writable: true,
    importable: true,
  })
})

test('/auth/import-gh drops the cached context so the new token is used', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth() })
  const res = await call(handler, makeReq({ method: 'POST', url: `${API_PREFIX}/auth/import-gh` }))
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.raw), { ok: true, login: 'me', scopes: ['repo'] })
  assert.deepEqual(github.calls.map(entry => entry.name), ['forget'])
})

test('/context passes the Session directory and the request signal', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth() })
  const res = await call(handler, makeReq({ url: `${API_PREFIX}/context?dir=%2Fwork` }))
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.raw).repo.fullName, 'o/r')
  assert.equal(github.calls[0].dir, '/work')
  assert.equal(github.calls[0].options.repo, undefined)
  assert.ok(github.calls[0].options.signal instanceof AbortSignal)
})

test('list routes forward their filters and default the page', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth() })

  await call(handler, makeReq({ url: `${API_PREFIX}/issues?dir=/w&state=closed&filter=assigned&page=3` }))
  await call(handler, makeReq({ url: `${API_PREFIX}/pulls?dir=/w` }))
  await call(handler, makeReq({ url: `${API_PREFIX}/notifications?dir=/w&all=1` }))
  await call(handler, makeReq({ url: `${API_PREFIX}/item?dir=/w&kind=pull&number=12` }))

  const [issues, pulls, notifications, item] = github.calls
  assert.deepEqual([issues.options.state, issues.options.filter, issues.options.page], ['closed', 'assigned', 3])
  assert.equal(pulls.options.page, 1)
  assert.equal(notifications.options.all, true)
  assert.equal(item.options.kind, 'pull')
  assert.equal(item.options.number, 12)
})

test('a read-only configuration refuses the action route and allows the rest', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth(), panelWrites: false })

  const refused = await call(
    handler,
    makeReq({ method: 'POST', url: `${API_PREFIX}/action`, body: { action: 'close', number: 1 } }),
  )
  assert.equal(refused.statusCode, 403)
  assert.equal(JSON.parse(refused.raw).error.code, 'writes_disabled')
  assert.equal(github.calls.length, 0)

  const allowed = await call(handler, makeReq({ url: `${API_PREFIX}/context?dir=/w` }))
  assert.equal(allowed.statusCode, 200)
})

test('a write forwards the action payload', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth() })
  const res = await call(
    handler,
    makeReq({ method: 'POST', url: `${API_PREFIX}/action?dir=/w`, body: { action: 'comment', number: 4, body: 'hi' } }),
  )
  assert.equal(res.statusCode, 200)
  assert.deepEqual(github.calls[0], {
    name: 'action',
    dir: '/w',
    options: {
      repo: undefined,
      action: 'comment',
      number: 4,
      body: 'hi',
      title: undefined,
      signal: github.calls[0].options.signal,
    },
  })
})

test('a plugin failure reaches the panel as its machine code and status', async () => {
  const cases = [
    { error: new GithubError('no_token', 'no token'), status: 409 },
    { error: new GithubError('invalid_token', 'bad'), status: 401 },
    { error: new GithubError('no_remote', 'no remote'), status: 409 },
    { error: new GithubError('not_github', 'not github'), status: 409 },
    { error: new GithubError('rate_limited', 'slow down', { resetAt: '2026-01-01T00:00:00Z' }), status: 429 },
    { error: new GithubError('not_found', 'missing'), status: 404 },
    { error: new GithubError('gh_missing', 'no gh'), status: 503 },
    { error: new GithubError('github_error', 'upstream'), status: 502 },
    { error: new Error('unexpected'), status: 500 },
  ]
  for (const entry of cases) {
    const github = fakeGithub({
      context: async () => {
        throw entry.error
      },
    })
    const handler = createApi({ github, auth: fakeAuth() })
    const res = await call(handler, makeReq({ url: `${API_PREFIX}/context?dir=/w` }))
    assert.equal(res.statusCode, entry.status, entry.error.message)
    const body = JSON.parse(res.raw)
    assert.equal(body.ok, false)
    if (entry.error instanceof GithubError) {
      assert.equal(body.error.code, entry.error.code)
    } else {
      assert.equal(body.error.code, 'internal')
    }
  }
})

test('a body over the budget is refused without reaching the service', async () => {
  const github = fakeGithub()
  const handler = createApi({ github, auth: fakeAuth() })
  const huge = 'x'.repeat(70 * 1024)
  const res = await call(
    handler,
    makeReq({ method: 'POST', url: `${API_PREFIX}/action?dir=/w`, body: { action: 'comment', number: 1, body: huge } }),
  )
  assert.equal(res.statusCode, 413)
  assert.equal(JSON.parse(res.raw).error.code, 'payload_too_large')
  assert.equal(github.calls.length, 0)
})

test('malformed JSON is a bad request', async () => {
  const handler = createApi({ github: fakeGithub(), auth: fakeAuth() })
  const res = await call(handler, makeReq({ method: 'POST', url: `${API_PREFIX}/action?dir=/w`, body: '{not json' }))
  assert.equal(res.statusCode, 400)
  assert.equal(JSON.parse(res.raw).error.code, 'bad_request')
})

test('an unknown route or a foreign prefix is a 404', async () => {
  const handler = createApi({ github: fakeGithub(), auth: fakeAuth() })
  assert.equal((await call(handler, makeReq({ url: `${API_PREFIX}/nope` }))).statusCode, 404)
  assert.equal((await call(handler, makeReq({ url: '/dsh-git/api/state' }))).statusCode, 404)
})
