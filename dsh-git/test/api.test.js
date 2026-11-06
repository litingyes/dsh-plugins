import test from 'node:test'
import assert from 'node:assert/strict'
import { API_PREFIX, createApi } from '../api.js'
import { GitError } from '../git.js'

/** A ServerResponse stand-in that records what the handler wrote. */
function makeRes() {
  const listeners = new Map()
  const res = {
    statusCode: 0,
    headers: {},
    headersSent: false,
    writableEnded: false,
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    on(event, handler) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return this
    },
    end(chunk) {
      if (chunk !== undefined) this.chunks.push(String(chunk))
      this.headersSent = true
      this.writableEnded = true
      for (const handler of listeners.get('close') ?? []) handler()
    },
    get body() {
      return this.chunks.join('')
    },
    get json() {
      return JSON.parse(this.body)
    },
  }
  return res
}

/** An IncomingMessage stand-in that emits its body on the next microtask. */
function makeReq({ method = 'GET', url = '/', body, headers = {} } = {}) {
  const listeners = new Map()
  const req = {
    method,
    url,
    headers,
    on(event, handler) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return req
    },
  }
  queueMicrotask(() => {
    if (body !== undefined) {
      for (const handler of listeners.get('data') ?? []) handler(Buffer.from(body))
    }
    for (const handler of listeners.get('end') ?? []) handler()
  })
  return req
}

/** A service stub whose every call is recorded. */
function makeGit(overrides = {}) {
  const calls = []
  const record = (name, result) => async (request) => {
    calls.push({ name, request })
    return typeof result === 'function' ? result(request) : result
  }
  const emptyState = {
    workspace: { id: 'w1', title: 'fixture', path: '/tmp/fixture' },
    repo: { isRepo: true, root: '/tmp/fixture', name: 'fixture', isEmpty: false },
    workspaces: [{ id: 'w1', title: 'fixture', path: '/tmp/fixture' }],
    branch: { head: 'main', upstream: null, ahead: 0, behind: 0, detached: false, unborn: false, oid: 'a'.repeat(40) },
    changes: { staged: [], unstaged: [], untracked: [], conflicted: [] },
    branches: [],
    worktrees: [],
    worktree: null,
    commits: [],
    isEmpty: false,
    limits: { maxCommits: 200, maxDiffBytes: 400000, refs: 'all' },
  }
  return {
    calls,
    state: record('state', emptyState),
    commitDetail: record('commitDetail', { sha: 'a'.repeat(40), files: [] }),
    diff: record('diff', { target: 'worktree', path: 'a.txt', binary: false, truncated: false, bytes: 3, patch: '+a\n' }),
    stage: record('stage', {}),
    unstage: record('unstage', {}),
    discard: record('discard', {}),
    commit: record('commit', {}),
    checkout: record('checkout', {}),
    createBranch: record('createBranch', {}),
    createWorktree: record('createWorktree', {}),
    removeWorktree: record('removeWorktree', {}),
    pruneWorktrees: record('pruneWorktrees', {}),
    merge: record('merge', {}),
    rebase: record('rebase', {}),
    cherryPick: record('cherryPick', {}),
    revert: record('revert', {}),
    dropCommit: record('dropCommit', {}),
    ...overrides,
  }
}

const ok = () => undefined

test('the router rejects an unauthorized caller before touching git', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: () => 401 })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state` }), res)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body, 'unauthorized')
  assert.equal(git.calls.length, 0)
})

test('a throwing authorizer fails closed', async () => {
  const git = makeGit()
  const handler = createApi({
    git,
    authorize: () => {
      throw new Error('no peer')
    },
  })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state` }), res)
  assert.equal(res.statusCode, 401)
  assert.equal(git.calls.length, 0)
})

test('the state endpoint returns the snapshot', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state?workspace=w1&refs=head&limit=20` }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.json.ok, true)
  assert.equal(res.json.branch.head, 'main')
  assert.equal(git.calls[0].name, 'state')
  assert.equal(git.calls[0].request.workspaceId, 'w1')
  assert.equal(git.calls[0].request.refs, 'head')
  assert.equal(git.calls[0].request.limit, 20)
  assert.ok(git.calls[0].request.signal instanceof AbortSignal)
})

test('the state endpoint forwards the Session directory', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(
    makeReq({ url: `${API_PREFIX}/api/state?dir=${encodeURIComponent('/Users/me/project')}` }),
    res,
  )
  assert.equal(res.statusCode, 200)
  assert.equal(git.calls[0].request.dir, '/Users/me/project')
  assert.equal(git.calls[0].request.workspaceId, undefined)
})

test('a directory outside the registry is a 400, not a 500', async () => {
  const git = makeGit({
    state: async () => {
      throw new GitError('outside_workspace', 'the requested directory is not inside any registered DSH workspace')
    },
  })
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state?dir=${encodeURIComponent('/tmp/elsewhere')}` }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.json.error.code, 'outside_workspace')
})

test('unknown routes and wrong methods are refused', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const notFound = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/nope` }), notFound)
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.json.error.code, 'not_found')

  const wrongMethod = makeRes()
  await handler(makeReq({ method: 'POST', url: `${API_PREFIX}/api/state`, body: '{}' }), wrongMethod)
  assert.equal(wrongMethod.statusCode, 405)
  assert.equal(wrongMethod.json.error.code, 'method_not_allowed')

  const outside = makeRes()
  await handler(makeReq({ url: '/somewhere/else' }), outside)
  assert.equal(outside.statusCode, 404)
})

test('a git error becomes its mapped status and code', async () => {
  const git = makeGit({
    state: async () => {
      throw new GitError('unknown_workspace', 'unknown workspace id: nope')
    },
  })
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state?workspace=nope` }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.json.ok, false)
  assert.equal(res.json.error.code, 'unknown_workspace')
  assert.match(res.json.error.message, /unknown workspace/u)
})

test('an unexpected throw is reported as an internal failure', async () => {
  const git = makeGit({
    state: async () => {
      throw new Error('boom')
    },
  })
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state` }), res)
  assert.equal(res.statusCode, 500)
  assert.equal(res.json.error.code, 'internal')
})

test('an action must name a known action', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const missing = makeRes()
  await handler(makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: JSON.stringify({}) }), missing)
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.json.error.code, 'bad_request')

  const unknown = makeRes()
  await handler(
    makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: JSON.stringify({ action: 'explode' }) }),
    unknown,
  )
  assert.equal(unknown.statusCode, 400)
  assert.equal(git.calls.length, 0)
})

test('malformed JSON and oversized bodies are refused', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const broken = makeRes()
  await handler(makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: '{' }), broken)
  assert.equal(broken.statusCode, 400)
  assert.equal(broken.json.error.code, 'bad_request')

  const huge = makeRes()
  await handler(
    makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: JSON.stringify({ action: 'stage', pad: 'x'.repeat(70_000) }) }),
    huge,
  )
  assert.equal(huge.statusCode, 413)
  assert.equal(huge.json.error.code, 'payload_too_large')
})

test('a successful action answers with the state it produced', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({ action: 'stage', workspace: 'w1', paths: ['a.txt'] }),
    }),
    res,
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.json.ok, true)
  assert.equal(res.json.repo.isRepo, true)
  assert.deepEqual(git.calls.map(call => call.name), ['stage', 'state'])
  assert.deepEqual(git.calls[0].request.paths, ['a.txt'])
  assert.equal(git.calls[0].request.workspaceId, 'w1')
})

test('discard without confirmation is a conflict', async () => {
  const git = makeGit({
    discard: async (request) => {
      if (request.confirm !== true) throw new GitError('confirm_required', 'discarding changes requires confirm: true')
      return {}
    },
  })
  const handler = createApi({ git, authorize: ok })
  const res = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({ action: 'discard', paths: ['a.txt'] }),
    }),
    res,
  )
  assert.equal(res.statusCode, 409)
  assert.equal(res.json.error.code, 'confirm_required')
})

test('commit and branch actions reach the service', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const commit = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({ action: 'commit', message: 'feat: x' }),
    }),
    commit,
  )
  assert.equal(commit.statusCode, 200)
  assert.equal(git.calls[0].name, 'commit')
  assert.equal(git.calls[0].request.message, 'feat: x')

  const branch = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({ action: 'create-branch', branch: 'feat/y' }),
    }),
    branch,
  )
  assert.equal(branch.statusCode, 200)
  assert.equal(git.calls[2].name, 'createBranch')
  assert.equal(git.calls[2].request.branch, 'feat/y')
})

test('diff and commit endpoints pass their query through', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const diff = makeRes()
  await handler(
    makeReq({ url: `${API_PREFIX}/api/diff?workspace=w1&target=commit&commit=${'a'.repeat(40)}&path=src%2Fa.js` }),
    diff,
  )
  assert.equal(diff.statusCode, 200)
  assert.equal(diff.json.patch, '+a\n')
  assert.equal(git.calls[0].request.target, 'commit')
  assert.equal(git.calls[0].request.path, 'src/a.js')

  const commit = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/commit?commit=${'a'.repeat(40)}` }), commit)
  assert.equal(commit.statusCode, 200)
  assert.equal(commit.json.commit.sha, 'a'.repeat(40))
})

test('no connection service means no auth plane, not no route', async () => {
  const git = makeGit()
  const handler = createApi({ git })
  const res = makeRes()
  await handler(makeReq({ url: `${API_PREFIX}/api/state` }), res)
  assert.equal(res.statusCode, 200)
})

test('worktree actions reach the service with their flags', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const create = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({
        action: 'create-worktree',
        workspace: 'w1',
        branch: 'feat/x',
        path: '.agents/worktrees/feat/x',
        createBranch: true,
      }),
    }),
    create,
  )
  assert.equal(create.statusCode, 200)
  assert.equal(create.json.ok, true)
  assert.equal(git.calls[0].name, 'createWorktree')
  assert.equal(git.calls[0].request.workspaceId, 'w1')
  assert.equal(git.calls[0].request.branch, 'feat/x')
  assert.equal(git.calls[0].request.path, '.agents/worktrees/feat/x')
  assert.equal(git.calls[0].request.createBranch, true)

  const remove = makeRes()
  await handler(
    makeReq({
      method: 'POST',
      url: `${API_PREFIX}/api/action`,
      body: JSON.stringify({ action: 'remove-worktree', path: '/tmp/tree', confirm: true, force: true }),
    }),
    remove,
  )
  assert.equal(remove.statusCode, 200)
  assert.equal(git.calls[2].name, 'removeWorktree')
  assert.equal(git.calls[2].request.path, '/tmp/tree')
  assert.equal(git.calls[2].request.confirm, true)
  assert.equal(git.calls[2].request.force, true)

  const prune = makeRes()
  await handler(
    makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: JSON.stringify({ action: 'prune-worktrees' }) }),
    prune,
  )
  assert.equal(prune.statusCode, 200)
  assert.equal(git.calls[4].name, 'pruneWorktrees')
  // Every mutation answers with the state it produced, worktrees included.
  assert.deepEqual(prune.json.worktrees, [])
})

test('worktree failures map to their own statuses', async () => {
  const cases = [
    ['invalid_worktree_path', 400],
    ['unknown_worktree', 400],
    ['worktree_exists', 409],
    ['worktree_in_use', 409],
    ['branch_in_worktree', 409],
  ]
  for (const [code, status] of cases) {
    const git = makeGit({
      removeWorktree: async () => {
        throw new GitError(code, `${code} happened`, { path: '/tmp/tree' })
      },
    })
    const handler = createApi({ git, authorize: ok })
    const res = makeRes()
    await handler(
      makeReq({
        method: 'POST',
        url: `${API_PREFIX}/api/action`,
        body: JSON.stringify({ action: 'remove-worktree', path: '/tmp/tree', confirm: true }),
      }),
      res,
    )
    assert.equal(res.statusCode, status, code)
    assert.equal(res.json.error.code, code)
    assert.equal(res.json.error.path, '/tmp/tree')
  }
})

test('history actions reach the service with their arguments', async () => {
  const git = makeGit()
  const handler = createApi({ git, authorize: ok })

  const post = async (body) => {
    const res = makeRes()
    await handler(makeReq({ method: 'POST', url: `${API_PREFIX}/api/action`, body: JSON.stringify(body) }), res)
    assert.equal(res.statusCode, 200, body.action)
    assert.equal(res.json.ok, true)
    return res
  }

  await post({ action: 'merge', workspace: 'w1', branch: 'side', type: 'local' })
  const merge = git.calls.find(call => call.name === 'merge')
  assert.ok(merge !== undefined)
  assert.equal(merge.request.workspaceId, 'w1')
  assert.equal(merge.request.branch, 'side')
  assert.equal(merge.request.type, 'local')

  await post({ action: 'rebase', branch: 'origin/main', type: 'remote' })
  const rebase = git.calls.find(call => call.name === 'rebase')
  assert.equal(rebase.request.branch, 'origin/main')
  assert.equal(rebase.request.type, 'remote')

  await post({ action: 'cherry-pick', commit: 'a'.repeat(40) })
  assert.equal(git.calls.find(call => call.name === 'cherryPick').request.commit, 'a'.repeat(40))

  await post({ action: 'revert', commit: 'b'.repeat(40) })
  assert.equal(git.calls.find(call => call.name === 'revert').request.commit, 'b'.repeat(40))

  await post({ action: 'drop-commit', commit: 'c'.repeat(40), confirm: true })
  const drops = git.calls.filter(call => call.name === 'dropCommit')
  assert.equal(drops[0].request.commit, 'c'.repeat(40))
  assert.equal(drops[0].request.confirm, true)

  // Only a literal `true` counts for the confirmation the service requires.
  await post({ action: 'drop-commit', commit: 'd'.repeat(40), confirm: 'yes' })
  assert.equal(git.calls.filter(call => call.name === 'dropCommit')[1].request.confirm, false)

  // Every mutation answers with the state it produced.
  assert.equal(git.calls.filter(call => call.name === 'state').length, 6)
})

test('history failures map to their own statuses', async () => {
  const cases = [
    ['unknown_commit', 400],
    ['merge_commit', 400],
    ['root_commit', 400],
    ['same_branch', 409],
    ['same_commit', 409],
    ['not_ancestor', 409],
    ['merges_in_range', 409],
    ['worktree_dirty', 409],
    ['repository_busy', 409],
    ['detached_head', 409],
    ['no_commit', 409],
    ['merge_conflict', 409],
    ['rebase_conflict', 409],
    ['cherry_pick_conflict', 409],
    ['revert_conflict', 409],
  ]
  for (const [code, status] of cases) {
    const git = makeGit({
      dropCommit: async () => {
        throw new GitError(code, `${code} happened`, { commit: 'a'.repeat(40) })
      },
    })
    const handler = createApi({ git, authorize: ok })
    const res = makeRes()
    await handler(
      makeReq({
        method: 'POST',
        url: `${API_PREFIX}/api/action`,
        body: JSON.stringify({ action: 'drop-commit', commit: 'a'.repeat(40), confirm: true }),
      }),
      res,
    )
    assert.equal(res.statusCode, status, code)
    assert.equal(res.json.error.code, code)
    // `GitError.detail` is spread into the wire error, so the client can name
    // the commit a refusal is about.
    assert.equal(res.json.error.commit, 'a'.repeat(40))
  }
})
