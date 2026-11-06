/**
 * Pure rules behind the commit-node menu: what is reachable from HEAD, and
 * which of cherry-pick / revert / drop a snapshot permits.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { commitActionState, reachableFromHead } from '../src/client/commit-actions.js'
import { en, zh } from '../src/client/i18n.js'

/** One commit row, shaped like `parseLog` output. */
function commit(sha, parents = []) {
  return { sha, parents }
}

/** A linear history a -> b -> c, with HEAD at c. */
const LINEAR = [
  commit('c', ['b']),
  commit('b', ['a']),
  commit('a', []),
]

const HEAD = 'c'

test('reachableFromHead walks the loaded parents and stops at the snapshot edge', () => {
  assert.deepEqual([...reachableFromHead(LINEAR, HEAD)].sort(), ['a', 'b', 'c'])
  // A graph that does not carry HEAD proves nothing.
  assert.equal(reachableFromHead(LINEAR, 'missing').size, 0)
  // A truncated graph stops where the parents leave the snapshot.
  const truncated = [commit('c', ['b']), commit('b', ['older-than-the-limit'])]
  assert.deepEqual([...reachableFromHead(truncated, 'c')].sort(), ['b', 'c'])
  assert.equal(reachableFromHead(undefined, HEAD).size, 0)
})

test('every action is allowed on an ordinary ancestor commit', () => {
  const state = commitActionState(commit('b', ['a']), {
    headOid: HEAD,
    attached: true,
    operation: null,
    dirty: false,
    reachable: reachableFromHead(LINEAR, HEAD),
  })
  assert.deepEqual(state.cherryPick, { enabled: true, reasonKey: null })
  assert.deepEqual(state.revert, { enabled: true, reasonKey: null })
  assert.deepEqual(state.drop, { enabled: true, reasonKey: null })
})

test('shared refusals win in the order a reader would fix them', () => {
  const base = { headOid: HEAD, attached: true, operation: null, dirty: false, reachable: new Set(['a', 'b', 'c']) }
  const node = commit('b', ['a'])

  assert.equal(commitActionState(node, { ...base, busy: true }).drop.reasonKey, 'action.reasonBusy')
  assert.equal(commitActionState(node, { ...base, attached: false }).drop.reasonKey, 'action.reasonDetached')
  assert.equal(commitActionState(node, { ...base, operation: 'rebase' }).revert.reasonKey, 'action.reasonOperation')
  assert.equal(commitActionState(node, { ...base, dirty: true }).cherryPick.reasonKey, 'action.reasonDirty')
})

test('merge and root commits get the reasons that name them', () => {
  const base = { headOid: HEAD, attached: true, operation: null, dirty: false }

  const merge = commitActionState(commit('m', ['a', 'b']), { ...base, reachable: new Set(['m', 'a', 'b']) })
  assert.equal(merge.cherryPick.reasonKey, 'graph.reasonMerge')
  assert.equal(merge.revert.reasonKey, 'graph.reasonMerge')
  assert.equal(merge.drop.reasonKey, 'graph.reasonMerge')

  const root = commitActionState(commit('a', []), { ...base, reachable: new Set(['a']) })
  assert.equal(root.drop.reasonKey, 'graph.reasonRoot')
  assert.equal(root.revert.enabled, true)
})

test('HEAD cannot be cherry-picked onto itself', () => {
  const state = commitActionState(commit('c', ['b']), {
    headOid: HEAD,
    attached: true,
    operation: null,
    dirty: false,
    reachable: reachableFromHead(LINEAR, HEAD),
  })
  assert.equal(state.cherryPick.reasonKey, 'graph.reasonHead')
  // Reverting or dropping the tip commit are both meaningful.
  assert.equal(state.revert.enabled, true)
  assert.equal(state.drop.enabled, true)
})

test('revert and drop require the commit to be on the current branch', () => {
  const elsewhere = commitActionState(commit('x', ['a']), {
    headOid: HEAD,
    attached: true,
    operation: null,
    dirty: false,
    reachable: reachableFromHead(LINEAR, HEAD),
  })
  assert.equal(elsewhere.revert.reasonKey, 'graph.reasonNotOnBranch')
  assert.equal(elsewhere.drop.reasonKey, 'graph.reasonNotOnBranch')
  // Cherry-pick is about the object, not about where it currently lives.
  assert.equal(elsewhere.cherryPick.enabled, true)
})

test('every refusal key is translated in both dictionaries', () => {
  const keys = new Set()
  const base = { headOid: HEAD, attached: true, operation: null, dirty: false, reachable: new Set(['a', 'b', 'c']) }
  const variants = [
    {},
    { busy: true },
    { attached: false },
    { operation: 'merge' },
    { dirty: true },
  ]
  for (const variant of variants) {
    for (const node of [commit('a', []), commit('b', ['a']), commit('c', ['b']), commit('m', ['a', 'b'])]) {
      const state = commitActionState(node, { ...base, ...variant })
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
