/**
 * One production snapshot per Session directory, shared by every render.
 *
 * The board is read-only, so the store is small: one fetch, a status, a last
 * failure, and a subscribe/snapshot pair for `useSyncExternalStore`. A read that
 * a later refresh started is discarded by the controller, so a slow answer never
 * overwrites a newer one.
 *
 * @module @litingyes/dsh-director/client/store
 */

import * as React from 'react'

/** The snapshot a surface sees before a directory is known. */
const IDLE_STATE = Object.freeze({
  dir: '',
  status: 'idle',
  snapshot: null,
  failure: null,
})

/** A store for a render that has no Session directory. Its methods do nothing. */
function createIdleStore() {
  return {
    dir: '',
    getSnapshot: () => IDLE_STATE,
    subscribe: () => () => undefined,
    retain: () => () => undefined,
    refresh: () => Promise.resolve(false),
  }
}

/**
 * Build the store for one working directory.
 *
 * @param {{ state: (options: object) => Promise<object> }} api client.
 * @param {string} dir absolute Session working directory.
 * @returns {object} store.
 */
export function createDirectorStore(api, dir) {
  let state = { dir, status: 'idle', snapshot: null, failure: null }
  const listeners = new Set()
  let inFlight = null
  let controller = null
  let retained = 0

  const publish = patch => {
    state = { ...state, ...patch }
    for (const listener of [...listeners]) listener()
  }

  const isAbort = failure =>
    failure !== null && typeof failure === 'object' && failure.name === 'AbortError'

  const refresh = () => {
    if (inFlight !== null) return inFlight
    if (controller !== null) controller.abort()
    controller = new AbortController()
    publish({ status: state.snapshot === null ? 'loading' : 'refreshing', failure: null })
    inFlight = api
      .state({ dir, signal: controller.signal })
      .then(snapshot => {
        publish({ status: 'ready', snapshot, failure: null })
        return true
      })
      .catch(failure => {
        if (isAbort(failure)) return false
        publish({ status: state.snapshot === null ? 'error' : 'ready', failure })
        return false
      })
      .finally(() => {
        inFlight = null
        controller = null
      })
    return inFlight
  }

  const subscribe = listener => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const retain = () => {
    retained += 1
    if (retained === 1) refresh()
    return () => {
      retained -= 1
      if (retained === 0 && controller !== null) controller.abort()
    }
  }

  return {
    dir,
    getSnapshot: () => state,
    subscribe,
    retain,
    refresh,
  }
}

/**
 * Build the per-directory store map.
 *
 * @param {object} api client from `api-client.js`.
 * @returns {{ idle: object, forDir: (dir: string) => object }} stores.
 */
export function createDirectorStores(api) {
  const stores = new Map()
  const idle = createIdleStore()
  return {
    idle,
    forDir(dir) {
      if (typeof dir !== 'string' || dir === '') return idle
      let store = stores.get(dir)
      if (store === undefined) {
        store = createDirectorStore(api, dir)
        stores.set(dir, store)
      }
      return store
    },
  }
}

/**
 * Subscribe one component to a store. The subscription retains the store for
 * the component's lifetime, so a directory switch does not keep fetching.
 *
 * @param {object} store store from `createDirectorStores`.
 * @returns {object} the current state.
 */
export function useDirectorStore(store) {
  React.useEffect(() => store.retain(), [store])
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
