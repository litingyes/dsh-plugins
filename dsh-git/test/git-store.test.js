/**
 * The shared per-directory store: one read per directory, mutations that answer
 * with the next snapshot, and the ordering rule that keeps a stale read from
 * overwriting a switch.
 *
 * These tests use a fake API and no DOM. The store's React hook is not exercised
 * here; the browser bundle test covers registration and the component contract.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createGitStore, createGitStores } from '../src/client/git-store.js'

/** One repository snapshot with the fields the store reads. */
function snapshot(branch = 'main', workspace = 'w-1') {
  return {
    workspace: { id: workspace, title: 'repo', path: '/repo' },
    repo: { isRepo: true, root: '/repo', name: 'repo' },
    branch: { head: branch, oid: null, detached: false, unborn: false, upstream: null, ahead: 0, behind: 0 },
    changes: { staged: [], unstaged: [], untracked: [], conflicted: [] },
    branches: [],
    worktrees: [],
    commits: [],
    isEmpty: false,
    limits: { refs: 'all' },
  }
}

/** A promise whose settlement the test controls. */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

/** Let the store's queued promise callbacks run. */
function tick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * A fake client that records every call.
 *
 * @param {object} [options] overrides.
 * @param {Function} [options.state] custom `/state` implementation.
 * @param {Function} [options.action] custom `/action` implementation.
 */
function makeApi(options = {}) {
  const stateCalls = []
  const actionCalls = []
  return {
    stateCalls,
    actionCalls,
    state: request => {
      stateCalls.push(request)
      return options.state === undefined
        ? Promise.resolve(snapshot())
        : options.state(request)
    },
    action: request => {
      actionCalls.push(request)
      return options.action === undefined
        ? Promise.resolve(snapshot('next'))
        : options.action(request)
    },
  }
}

test('a refresh loads once and publishes the snapshot', async () => {
  const api = makeApi()
  const store = createGitStore(api, '/repo')

  assert.equal(store.getSnapshot().status, 'idle')
  assert.equal(store.getSnapshot().snapshot, null)

  await store.refresh()

  assert.equal(api.stateCalls.length, 1)
  assert.equal(api.stateCalls[0].dir, '/repo')
  assert.equal(api.stateCalls[0].refs, undefined)
  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().snapshot.workspace.id, 'w-1')
  assert.equal(store.getSnapshot().failure, null)
})

test('concurrent refreshes share one request', async () => {
  const pending = deferred()
  const api = makeApi({ state: () => pending.promise })
  const store = createGitStore(api, '/repo')

  const first = store.refresh()
  const second = store.refresh()
  await tick()
  assert.equal(api.stateCalls.length, 1)

  pending.resolve(snapshot())
  await Promise.all([first, second])
  assert.equal(store.getSnapshot().status, 'ready')
})

test('a failed refresh keeps the snapshot that is already on screen', async () => {
  let fail = false
  const api = makeApi({
    state: request => fail
      ? Promise.reject(Object.assign(new Error('git failed'), { name: 'ApiError', code: 'git_failed' }))
      : Promise.resolve(snapshot()),
  })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  fail = true
  await store.refresh()

  const state = store.getSnapshot()
  assert.equal(state.status, 'ready')
  assert.equal(state.snapshot.branch.head, 'main')
  assert.equal(state.failure.code, 'git_failed')

  store.clearFailure()
  assert.equal(store.getSnapshot().failure, null)
})

test('perform sends the resolved workspace and applies the answer', async () => {
  const api = makeApi({
    action: () => Promise.resolve(snapshot('feature')),
  })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  const done = await store.perform({ action: 'checkout', branch: 'feature' })

  assert.equal(done, true)
  assert.deepEqual(api.actionCalls[0], {
    action: 'checkout',
    branch: 'feature',
    workspace: 'w-1',
    refs: undefined,
  })
  assert.equal(store.getSnapshot().snapshot.branch.head, 'feature')
  assert.equal(store.getSnapshot().busy, false)
  assert.equal(store.getSnapshot().pending, null)
})

test('a refused action keeps the previous state and records the failure', async () => {
  const refusal = Object.assign(new Error('already checked out'), {
    name: 'ApiError',
    code: 'branch_in_worktree',
    detail: { branch: 'feature', path: '/repo/.agents/worktrees/feature' },
  })
  const api = makeApi({
    action: () => Promise.reject(refusal),
  })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  const done = await store.perform({ action: 'checkout', branch: 'feature' })

  assert.equal(done, false)
  assert.equal(store.getSnapshot().snapshot.branch.head, 'main')
  assert.equal(store.getSnapshot().failure, refusal)
  assert.equal(store.getSnapshot().busy, false)
})

test('perform without a resolved workspace never reaches the Host', async () => {
  const api = makeApi()
  const store = createGitStore(api, '/repo')

  const done = await store.perform({ action: 'checkout', branch: 'feature' })

  assert.equal(done, false)
  assert.equal(api.actionCalls.length, 0)
})

test('a read that starts before a mutation cannot overwrite its answer', async () => {
  const stale = deferred()
  let reads = 0
  const api = makeApi({
    state: () => {
      reads += 1
      return reads === 1 ? Promise.resolve(snapshot()) : stale.promise
    },
    action: () => Promise.resolve(snapshot('feature')),
  })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  // This read is now in flight and would answer with the old branch.
  const pendingRead = store.refresh()
  const done = await store.perform({ action: 'checkout', branch: 'feature' })
  assert.equal(done, true)
  stale.resolve(snapshot('main'))
  await pendingRead
  await tick()

  assert.equal(store.getSnapshot().snapshot.branch.head, 'feature')
  assert.equal(store.getSnapshot().status, 'ready')
})

test('a cancelled read does not block the next one', async () => {
  let reads = 0
  const api = makeApi({
    state: request => {
      reads += 1
      if (reads !== 2) return Promise.resolve(snapshot())
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    },
    action: () => Promise.resolve(snapshot('feature')),
  })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  // This read would hang forever if a mutation did not cancel it.
  void store.refresh()
  const done = await store.perform({ action: 'checkout', branch: 'feature' })
  assert.equal(done, true)

  // The cancelled read released its slot, so this is a fresh request.
  await store.refresh()
  assert.equal(reads, 3)
  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().failure, null)
})

test('setRefs refetches with the graph mode the panel asked for', async () => {
  const api = makeApi()
  const store = createGitStore(api, '/repo')
  await store.refresh()

  store.setRefs('head')
  await store.refresh()

  assert.equal(api.stateCalls.length, 2)
  assert.equal(api.stateCalls[1].refs, 'head')
  assert.equal(store.getSnapshot().refs, 'head')
})

test('setRefs during an action reloads once the action answers', async () => {
  const pendingAction = deferred()
  const api = makeApi({ action: () => pendingAction.promise })
  const store = createGitStore(api, '/repo')
  await store.refresh()

  const running = store.perform({ action: 'checkout', branch: 'feature' })
  store.setRefs('head')
  assert.equal(store.getSnapshot().refs, 'head')
  // The action is still running, so no read may start yet.
  assert.equal(api.stateCalls.length, 1)

  pendingAction.resolve(snapshot('feature'))
  await running
  await tick()

  // Exactly the reload the deferred refs change asked for, not a third read.
  assert.equal(api.stateCalls.length, 2)
  assert.equal(api.stateCalls[1].refs, 'head')
})

test('retain starts one read, refreshes on focus, and releases its listener', async () => {
  const listeners = new Set()
  const originalWindow = globalThis.window
  globalThis.window = {
    addEventListener: (name, listener) => {
      if (name === 'focus') listeners.add(listener)
    },
    removeEventListener: (name, listener) => {
      if (name === 'focus') listeners.delete(listener)
    },
  }

  try {
    const api = makeApi()
    const store = createGitStore(api, '/repo')
    const first = store.retain()
    const second = store.retain()
    await tick()
    assert.equal(api.stateCalls.length, 1)
    assert.equal(listeners.size, 1)

    for (const listener of listeners) listener()
    await tick()
    assert.equal(api.stateCalls.length, 2)

    first()
    assert.equal(listeners.size, 1)
    second()
    assert.equal(listeners.size, 0)
  } finally {
    globalThis.window = originalWindow
  }
})

test('the idle store is shared and inert', async () => {
  const api = makeApi()
  const stores = createGitStores(api)

  assert.equal(stores.forDir(''), stores.idle)
  assert.equal(stores.forDir(undefined), stores.idle)
  assert.equal(stores.idle.getSnapshot(), stores.idle.getSnapshot())
  assert.equal(await stores.idle.refresh(), undefined)
  assert.equal(await stores.idle.perform({ action: 'checkout' }), false)
  assert.equal(api.stateCalls.length, 0)
  assert.equal(api.actionCalls.length, 0)
})

test('one store is cached per directory', () => {
  const api = makeApi()
  const stores = createGitStores(api)

  assert.equal(stores.forDir('/repo'), stores.forDir('/repo'))
  assert.notEqual(stores.forDir('/repo'), stores.forDir('/other'))
})
