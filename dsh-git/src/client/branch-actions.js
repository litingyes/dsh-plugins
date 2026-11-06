/**
 * Which branch-row actions a view may offer, and why it may not.
 *
 * Merge and rebase both move the checked-out branch, so they share the history
 * actions' preconditions: an attached HEAD, no operation already stopped, and a
 * clean tracked worktree. They also have one of their own — the current branch
 * cannot be merged into or rebased onto itself.
 *
 * Like `commit-actions.js`, this module only answers in dictionary keys; the
 * Host repeats the checks before running anything.
 *
 * @module @litingyes/dsh-git/client/branch-actions
 */

/** An action with no reason to refuse it. */
const ALLOWED = Object.freeze({ enabled: true, reasonKey: null })

/**
 * Mark one action as refused.
 *
 * @param {string} reasonKey dictionary key explaining the refusal.
 * @returns {{enabled: false, reasonKey: string}} the decision.
 */
function blocked(reasonKey) {
  return { enabled: false, reasonKey }
}

/**
 * The state of the branch menu's two history actions.
 *
 * @param {{name?: string, current?: boolean}|null|undefined} branch one local or remote branch row.
 * @param {object} [context] snapshot facts.
 * @param {boolean} [context.hasCommit] the repository has a first commit.
 * @param {boolean} [context.attached] HEAD is on a branch with a commit.
 * @param {string|null} [context.operation] in-progress merge/rebase/…
 * @param {boolean} [context.dirty] staged or unstaged tracked changes.
 * @param {boolean} [context.busy] an action is in flight.
 * @returns {{merge: object, rebase: object}} one decision per action.
 */
export function branchActionState(branch, context = {}) {
  const isCurrent = branch?.current === true

  let reasonKey = null
  if (isCurrent) reasonKey = 'branches.reasonCurrent'
  else if (context.busy === true) reasonKey = 'action.reasonBusy'
  else if (context.hasCommit === false) reasonKey = 'branches.reasonEmpty'
  else if (context.attached === false) reasonKey = 'action.reasonDetached'
  else if (typeof context.operation === 'string' && context.operation !== '') reasonKey = 'action.reasonOperation'
  else if (context.dirty === true) reasonKey = 'action.reasonDirty'

  const decision = reasonKey === null ? ALLOWED : blocked(reasonKey)
  return { merge: decision, rebase: decision }
}
