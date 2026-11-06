/**
 * Which commit-node actions a view may offer, and why it may not.
 *
 * The rules are pure so the answers are testable without a DOM, and so the menu
 * and the Host agree on what "possible" means. They are still a *client* gate:
 * every action re-checks the same facts on the Host before it runs a git
 * command, because a snapshot can be a few seconds old.
 *
 * The returned `reasonKey` is a dictionary key, not a sentence: the menu needs
 * the translated tooltip, and this module stays free of the locale service.
 *
 * @module @litingyes/dsh-git/client/commit-actions
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
 * Collect the commits reachable from HEAD through the loaded graph.
 *
 * A commit graph may be shorter than the repository (`maxCommits`), so the walk
 * stops at nodes the snapshot does not carry. The result is therefore
 * conservative: a commit missing from the set may still be on the branch, and
 * the Host is the final judge. That is the right direction — an action the
 * graph cannot prove safe should not be offered.
 *
 * @param {object[]} commits commits in graph order, each with `sha` and `parents`.
 * @param {string|null|undefined} headOid the checked-out commit.
 * @returns {Set<string>} object names reachable from HEAD within the snapshot.
 */
export function reachableFromHead(commits, headOid) {
  const reachable = new Set()
  if (typeof headOid !== 'string' || headOid === '') return reachable

  const bySha = new Map()
  for (const commit of Array.isArray(commits) ? commits : []) {
    if (typeof commit?.sha === 'string' && commit.sha !== '') bySha.set(commit.sha, commit)
  }
  if (!bySha.has(headOid)) return reachable

  const queue = [headOid]
  while (queue.length > 0) {
    const sha = queue.pop()
    if (reachable.has(sha)) continue
    reachable.add(sha)
    const parents = bySha.get(sha)?.parents
    if (!Array.isArray(parents)) continue
    for (const parent of parents) {
      if (typeof parent === 'string' && parent !== '' && !reachable.has(parent) && bySha.has(parent)) {
        queue.push(parent)
      }
    }
  }
  return reachable
}

/**
 * The state of the commit menu's three history actions.
 *
 * Precedence is deliberate: the first reason a reader can act on wins. A dirty
 * worktree blocks all three (git refuses a rewrite on top of unstaged edits);
 * a merge commit has no mainline to pick or revert; a commit outside the current
 * branch cannot be reverted or dropped without rewriting someone else's history.
 * Cherry-picking is not reachability-bound: git can pick any commit object.
 *
 * @param {{sha: string, parents?: string[]}|null|undefined} commit the node's commit.
 * @param {object} [context] snapshot facts.
 * @param {string|null} [context.headOid] checked-out commit.
 * @param {boolean} [context.attached] HEAD is on a branch with a commit.
 * @param {string|null} [context.operation] in-progress merge/rebase/…
 * @param {boolean} [context.dirty] staged or unstaged tracked changes.
 * @param {boolean} [context.busy] an action is in flight.
 * @param {Set<string>} [context.reachable] from {@link reachableFromHead}.
 * @returns {{cherryPick: object, revert: object, drop: object}} one decision per action.
 */
export function commitActionState(commit, context = {}) {
  const parents = Array.isArray(commit?.parents) ? commit.parents : []
  const isMerge = parents.length > 1
  const isRoot = parents.length === 0
  const sha = typeof commit?.sha === 'string' ? commit.sha : ''
  const isHead = sha !== '' && context.headOid === sha
  const reachable = context.reachable instanceof Set ? context.reachable.has(sha) : true

  // Shared refusals, in the order a reader would fix them.
  let shared = null
  if (context.busy === true) shared = 'action.reasonBusy'
  else if (context.attached === false) shared = 'action.reasonDetached'
  else if (typeof context.operation === 'string' && context.operation !== '') shared = 'action.reasonOperation'
  else if (context.dirty === true) shared = 'action.reasonDirty'

  const cherryPick = shared !== null
    ? blocked(shared)
    : isMerge
      ? blocked('graph.reasonMerge')
      : isHead
        ? blocked('graph.reasonHead')
        : ALLOWED

  const revert = shared !== null
    ? blocked(shared)
    : isMerge
      ? blocked('graph.reasonMerge')
      : !reachable
        ? blocked('graph.reasonNotOnBranch')
        : ALLOWED

  const drop = shared !== null
    ? blocked(shared)
    : isMerge
      ? blocked('graph.reasonMerge')
      : isRoot
        ? blocked('graph.reasonRoot')
        : !reachable
          ? blocked('graph.reasonNotOnBranch')
          : ALLOWED

  return { cherryPick, revert, drop }
}
