/**
 * Pure rules behind the branch-row context menu: when merge and rebase are
 * offerable, and which reason explains a refusal.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { branchActionState } from '../src/client/branch-actions.js'
import { en, zh } from '../src/client/i18n.js'

/** One branch row, shaped like `parseBranches` output plus annotations. */
function branch(overrides = {}) {
  return { name: 'main', type: 'local', current: false, ...overrides }
}

const READY = {
  hasCommit: true,
  attached: true,
  operation: null,
  dirty: false,
  busy: false,
}

test('a non-current branch can be merged into and rebased onto', () => {
  const state = branchActionState(branch({ name: 'side' }), READY)
  assert.deepEqual(state.merge, { enabled: true, reasonKey: null })
  assert.deepEqual(state.rebase, { enabled: true, reasonKey: null })
})

test('the current branch is refused first', () => {
  const state = branchActionState(branch({ name: 'main', current: true }), { ...READY, dirty: true })
  assert.equal(state.merge.reasonKey, 'branches.reasonCurrent')
  assert.equal(state.rebase.reasonKey, 'branches.reasonCurrent')
})

test('an in-flight action blocks both entries', () => {
  const state = branchActionState(branch({ name: 'side' }), { ...READY, busy: true })
  assert.equal(state.merge.reasonKey, 'action.reasonBusy')
  assert.equal(state.rebase.reasonKey, 'action.reasonBusy')
})

test('an empty repository has nothing to merge or rebase', () => {
  const state = branchActionState(branch({ name: 'side' }), { ...READY, hasCommit: false })
  assert.equal(state.merge.reasonKey, 'branches.reasonEmpty')
  assert.equal(state.rebase.reasonKey, 'branches.reasonEmpty')
})

test('history preconditions apply to both actions', () => {
  const detached = branchActionState(branch({ name: 'side' }), { ...READY, attached: false })
  assert.equal(detached.merge.reasonKey, 'action.reasonDetached')
  assert.equal(detached.rebase.reasonKey, 'action.reasonDetached')

  const busy = branchActionState(branch({ name: 'side' }), { ...READY, operation: 'merge' })
  assert.equal(busy.merge.reasonKey, 'action.reasonOperation')
  assert.equal(busy.rebase.reasonKey, 'action.reasonOperation')

  const dirty = branchActionState(branch({ name: 'side' }), { ...READY, dirty: true })
  assert.equal(dirty.merge.reasonKey, 'action.reasonDirty')
  assert.equal(dirty.rebase.reasonKey, 'action.reasonDirty')
})

test('remote branches are targets too', () => {
  const state = branchActionState(
    { name: 'origin/main', type: 'remote', current: false },
    READY,
  )
  assert.equal(state.merge.enabled, true)
  assert.equal(state.rebase.enabled, true)
})

test('every refusal key is translated in both dictionaries', () => {
  const variants = [
    branch({ name: 'main', current: true }),
    branch({ name: 'side' }),
  ]
  const contexts = [
    READY,
    { ...READY, busy: true },
    { ...READY, hasCommit: false },
    { ...READY, attached: false },
    { ...READY, operation: 'rebase' },
    { ...READY, dirty: true },
  ]
  const keys = new Set()
  for (const target of variants) {
    for (const context of contexts) {
      const state = branchActionState(target, context)
      for (const decision of Object.values(state)) {
        if (decision.reasonKey !== null) keys.add(decision.reasonKey)
      }
    }
  }
  for (const key of keys) {
    assert.notEqual(zh[key], undefined, `zh is missing ${key}`)
    assert.notEqual(en[key], undefined, `en is missing ${key}`)
  }
})
