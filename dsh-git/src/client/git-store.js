/**
 * One repository snapshot per Session workspace, shared by both plugin surfaces.
 *
 * The right-sidebar panel and the chat-page branch chip describe the same
 * repository, so they must not keep two copies of it: a branch switched in one
 * place would leave the other showing a stale name, and each surface would run
 * its own `git` reads. The store below owns the snapshot, the in-flight read,
 * the busy action, and the last failure; every mounted surface subscribes to
 * the same object and mutates it through the same methods.
 *
 * The store is created per absolute working directory, because the directory is
 * what identifies the repository (`/state?dir=` resolves it to a registered
 * workspace). A Session switch therefore selects a different store rather than
 * rewriting this one.
 *
 * Ordering matters here. A mutation answers with a fresh snapshot, so a read
 * that started before the mutation must never overwrite it; `generation` tags
 * each read and mutations advance it, which discards those stale answers. The
 * commit-graph "head only / all branches" toggle is the one read option owned
 * by a surface, so it lives here too and is replayed with the next read.
 *
 * @module @litingyes/dsh-git/client/git-store
 */

import * as React from 'react'

/** The snapshot a surface sees before a repository is known. */
const IDLE_STATE = Object.freeze({
  status: 'idle',
  dir: '',
  snapshot: null,
  failure: null,
  busy: false,
  pending: null,
  refs: undefined,
})

/** A store for a render that has no Session directory. Its methods do nothing. */
function createIdleStore() {
  return {
    getSnapshot: () => IDLE_STATE,
    subscribe: () => () => undefined,
    retain: () => () => undefined,
    refresh: () => Promise.resolve(),
    setRefs: () => undefined,
    perform: () => Promise.resolve(false),
    clearFailure: () => undefined,
  }
}

/**
 * Build the store for one working directory.
 *
 * @param {{state: Function, action: Function}} api client from `api-client.js`.
 * @param {string} dir absolute Session working directory.
 * @returns {object} the store consumed by `useGitStore`.
 */
export function createGitStore(api, dir) {
  let state = { ...IDLE_STATE, dir }
  const listeners = new Set()
  let inFlight = null
  let controller = null
  let retained = 0
  let listening = false
  /** Bumped by every mutation; a read carrying an older value is discarded. */
  let generation = 0
  /** A refs change that arrived while an action was running. */
  let reloadAfterBusy = false

  const publish = (patch) => {
    state = { ...state, ...patch }
    for (const listener of [...listeners]) listener()
  }

  const isAbort = failure =>
    failure !== null && typeof failure === 'object' && failure.name === 'AbortError'

  /**
   * Cancel the read in flight, if any.
   *
   * Its answer is already stale (a mutation superseded it, or no surface
   * observes the store any more), and releasing the bookkeeping first lets the
   * next read start instead of waiting on an aborted request.
   */
  const cancelRead = () => {
    controller?.abort()
    controller = null
    inFlight = null
  }

  /** Read the repository once; concurrent callers share the in-flight read. */
  const load = () => {
    if (inFlight !== null) return inFlight
    // An action answers with its own snapshot; racing it would only add a read
    // whose answer must be thrown away.
    if (state.busy) return Promise.resolve()
    const token = ++generation
    const control = new AbortController()
    controller = control
    publish({ status: 'loading', failure: null })
    let request = null
    request = (async () => {
      try {
        // The extra microtask keeps the first settlement asynchronous, so
        // `request` is assigned before this block's `finally` can run even if
        // the client throws synchronously.
        const snapshot = await Promise.resolve().then(() =>
          api.state({ dir, refs: state.refs, signal: control.signal }))
        if (token !== generation) return
        publish({ status: 'ready', snapshot, failure: null })
      } catch (failure) {
        if (isAbort(failure) || token !== generation) return
        // Keep a snapshot that was already on screen: a failed refresh is a
        // banner, not an empty panel.
        publish({ status: state.snapshot === null ? 'error' : 'ready', failure })
      } finally {
        // A superseded read must not clear the bookkeeping of a newer one.
        if (inFlight === request) {
          inFlight = null
          controller = null
        }
      }
    })()
    inFlight = request
    return request
  }

  const onFocus = () => {
    void load()
  }

  /** Attach one mounted surface; the first one starts the reads. */
  const retain = () => {
    retained += 1
    if (retained === 1 && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', onFocus)
      listening = true
    }
    // A surface that mounts later may show a snapshot that no focus event has
    // refreshed since; the first retain's read is shared, so this costs one
    // read at most.
    void load()
    let released = false
    return () => {
      if (released) return
      released = true
      retained -= 1
      if (retained !== 0) return
      if (listening) {
        window.removeEventListener('focus', onFocus)
        listening = false
      }
      // Nothing observes this store any more; drop the read instead of letting
      // it publish into a torn-down tree.
      cancelRead()
    }
  }

  /**
   * Run one mutating action against the workspace the snapshot names.
   *
   * @param {Record<string, unknown>} body action payload, e.g. `{action:'checkout', branch}`.
   * @returns {Promise<boolean>} whether the Host accepted it and returned a snapshot.
   */
  const perform = async (body) => {
    if (state.busy) return false
    const workspace = state.snapshot?.workspace?.id
    if (typeof workspace !== 'string' || workspace === '') return false
    // A read already in flight is now older than this mutation.
    generation += 1
    cancelRead()
    publish({
      busy: true,
      pending: typeof body?.branch === 'string' ? body.branch : null,
      failure: null,
    })
    try {
      const snapshot = await api.action({ ...body, workspace, refs: state.refs })
      publish({ busy: false, pending: null, status: 'ready', snapshot, failure: null })
      return true
    } catch (failure) {
      publish({ busy: false, pending: null, failure })
      return false
    } finally {
      if (reloadAfterBusy) {
        reloadAfterBusy = false
        void load()
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    retain,
    refresh: () => load(),
    setRefs: (next) => {
      const refs = next === 'head' ? 'head' : next === 'all' ? 'all' : undefined
      if (state.refs === refs) return
      publish({ refs })
      // A running action will answer from its own snapshot; refetch after it.
      if (state.busy) reloadAfterBusy = true
      else void load()
    },
    perform,
    clearFailure: () => {
      if (state.failure !== null) publish({ failure: null })
    },
  }
}

/**
 * The per-plugin store directory.
 *
 * @param {{state: Function, action: Function}} api client from `api-client.js`.
 * @returns {{idle: object, forDir: (dir: string) => object}} store lookup.
 */
export function createGitStores(api) {
  const idle = createIdleStore()
  const byDir = new Map()
  return {
    idle,
    forDir: (dir) => {
      if (typeof dir !== 'string' || dir === '') return idle
      let store = byDir.get(dir)
      if (store === undefined) {
        store = createGitStore(api, dir)
        byDir.set(dir, store)
      }
      return store
    },
  }
}

/**
 * Subscribe a component to one store.
 *
 * `retain` runs in an effect so a render never starts network work; the
 * subscription itself is `useSyncExternalStore`, whose snapshot is the store's
 * immutable state object.
 *
 * @param {object} store store from `createGitStores`.
 * @returns {object} the current store state.
 */
export function useGitStore(store) {
  React.useEffect(() => store.retain(), [store])
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
