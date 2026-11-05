import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApi } from '../api.js'
import { createGitService } from '../git.js'

/** Run git synchronously for fixture setup. */
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  })
}

/**
 * Boot a real HTTP server around the handler and return its base URL.
 *
 * This exercises the bytes an actual browser sends: a URL with a query string,
 * a JSON body, and the response headers.
 */
async function startServer(t, { workspace, authorize }) {
  const service = createGitService({
    workspaces: () => [{ id: 'w1', title: 'fixture', path: workspace }],
    config: { commandTimeoutMs: 20000 },
  })
  const handler = createApi({ git: service, authorize })
  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      res.statusCode = 500
      res.end('{}')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

/** Create a throwaway repository. */
function makeRepo(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-git-http-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test User')
  return dir
}

test('the real HTTP surface serves state, staging, and commit', async t => {
  const dir = makeRepo(t)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  const base = await startServer(t, { workspace: dir, authorize: () => undefined })

  const stateResponse = await fetch(`${base}/dsh-git/api/state?workspace=w1&refs=all`)
  assert.equal(stateResponse.status, 200)
  assert.equal(stateResponse.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.equal(stateResponse.headers.get('cache-control'), 'no-store')
  const state = await stateResponse.json()
  assert.equal(state.ok, true)
  assert.equal(state.repo.isRepo, true)
  assert.equal(state.isEmpty, true)
  assert.deepEqual(state.changes.untracked.map(entry => entry.path), ['a.txt'])

  const staged = await fetch(`${base}/dsh-git/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'stage', paths: ['a.txt'] }),
  })
  assert.equal(staged.status, 200)
  const afterStage = await staged.json()
  assert.equal(afterStage.ok, true)
  assert.deepEqual(afterStage.changes.staged.map(entry => entry.path), ['a.txt'])

  const patchResponse = await fetch(`${base}/dsh-git/api/diff?target=index&path=a.txt`)
  const patch = await patchResponse.json()
  assert.equal(patch.ok, true)
  assert.match(patch.patch, /\+one/u)

  const committed = await fetch(`${base}/dsh-git/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'commit', message: 'feat: first' }),
  })
  const afterCommit = await committed.json()
  assert.equal(afterCommit.ok, true)
  assert.equal(afterCommit.commits.length, 1)
  assert.equal(afterCommit.commits[0].subject, 'feat: first')

  const detailResponse = await fetch(
    `${base}/dsh-git/api/commit?commit=${afterCommit.commits[0].sha}`,
  )
  const detail = await detailResponse.json()
  assert.equal(detail.ok, true)
  assert.deepEqual(detail.commit.files.map(file => file.path), ['a.txt'])

  const missing = await fetch(`${base}/dsh-git/api/state?workspace=nope`)
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error.code, 'unknown_workspace')
})

test('the state route resolves a Session directory over the wire', async t => {
  const dir = makeRepo(t)
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  const base = await startServer(t, { workspace: dir, authorize: () => undefined })

  const byDir = await fetch(`${base}/dsh-git/api/state?dir=${encodeURIComponent(dir)}`)
  assert.equal(byDir.status, 200)
  const state = await byDir.json()
  assert.equal(state.ok, true)
  assert.equal(state.workspace.id, 'w1')
  assert.equal(state.repo.isRepo, true)

  const outside = await fetch(`${base}/dsh-git/api/state?dir=${encodeURIComponent('/tmp/not-a-workspace')}`)
  assert.equal(outside.status, 400)
  const refusal = await outside.json()
  assert.equal(refusal.ok, false)
  assert.equal(refusal.error.code, 'outside_workspace')
})

test('the HTTP surface refuses an unauthorized peer', async t => {
  const dir = makeRepo(t)
  const base = await startServer(t, { workspace: dir, authorize: () => 401 })

  const response = await fetch(`${base}/dsh-git/api/state`)
  assert.equal(response.status, 401)
  assert.equal(await response.text(), 'unauthorized')
})

test('an unknown endpoint is a JSON 404 for an authorized peer', async t => {
  const dir = makeRepo(t)
  const base = await startServer(t, { workspace: dir, authorize: () => undefined })
  const response = await fetch(`${base}/dsh-git/api/whatever`)
  assert.equal(response.status, 404)
  const body = await response.json()
  assert.equal(body.error.code, 'not_found')
})
