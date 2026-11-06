/**
 * The Git panel shell: header, tabs, one data load per Session workspace, and
 * the one place an action failure is displayed.
 *
 * The panel is a right-Sidebar tab, so it does not own a workspace choice: the
 * Session that owns the tab owns the repository. The working directory comes
 * from the framework's `useSessions` projection, exactly as the shipped file
 * tree resolves its root, and the Host maps that directory to a registered
 * workspace before running anything.
 *
 * The snapshot itself lives in `git-store.js`, not here: the chat-page branch
 * chip shows the same repository, and two surfaces that each keep their own
 * copy would disagree after either one switches a branch. Every mutation still
 * answers with a fresh snapshot from the Host, so the store has exactly one
 * source of truth and no second read to race.
 *
 * @module @litingyes/dsh-git/client/panel
 */

import * as React from 'react'
import { Tabs } from '@base-ui-components/react/tabs'
import { GraphView } from './graph-view.jsx'
import { ChangesView } from './changes-view.jsx'
import { BranchesView } from './branches-view.jsx'
import { GitMark, RefreshIcon } from './icons.jsx'
import { relativeTime } from './format.js'
import { failureText } from './failure.js'
import { useGitStore } from './git-store.js'
import { useTranslate } from './use-translate.js'

/**
 * A session projection hook for a render that has none.
 *
 * The right Sidebar always supplies `useSessions`, but the panel is also
 * mounted by tests and by a composition that gives no session; picking the hook
 * once keeps the call order stable across renders.
 */
function useNoSessions() {
  return undefined
}

/** `↑n ↓m` divergence pill, or nothing when the branch has no upstream. */
function Divergence({ branch, t }) {
  if (branch === null || branch === undefined) return null
  if (branch.upstream === null || branch.upstream === undefined) return null
  const ahead = branch.ahead ?? 0
  const behind = branch.behind ?? 0
  if (ahead === 0 && behind === 0) return null
  return React.createElement('span', { className: 'dgit-pill', title: branch.upstream },
    ahead > 0 ? `↑${ahead}` : null,
    ahead > 0 && behind > 0 ? ' ' : null,
    behind > 0 ? `↓${behind}` : null)
}

/** One counted tab label. */
function TabLabel({ text, count }) {
  if (count === undefined || count === 0) return text
  return React.createElement(React.Fragment, null,
    text,
    React.createElement('span', { className: 'dgit-tab-count' }, String(count)))
}

/**
 * The panel body.
 *
 * @param {object} props panel props.
 * @param {object} props.api client from `api-client.js`, used for commit details and diffs.
 * @param {object} props.stores shared per-directory store lookup.
 * @param {object | undefined} props.locale Client locale service.
 * @param {string | undefined} props.sessionId Session whose right Sidebar holds this tab.
 * @param {(selector: Function) => unknown} [props.useSessions] session projection hook.
 * @returns {React.ReactElement} the panel.
 */
export function GitPanel({ api, stores, locale, sessionId, useSessions }) {
  const { t, language } = useTranslate(locale)
  const [tab, setTab] = React.useState('graph')

  const useSessionsHook = typeof useSessions === 'function' ? useSessions : useNoSessions
  // Two primitive selectors, not one object: a selector that builds a fresh
  // object would never be referentially stable for `useSyncExternalStore`.
  const rawCwd = useSessionsHook(all =>
    sessionId === undefined ? undefined : all?.byId?.[sessionId]?.cwd)
  // A projection that has not loaded yet must read as "loading", not as "this
  // Session has no directory": the latter would flash on every fresh tab.
  const sessionsPending = useSessionsHook(all => all === undefined || all.phase === 'pending')
  const cwd = typeof rawCwd === 'string' && rawCwd !== '' ? rawCwd : undefined

  // One store per repository, shared with the chat-page branch chip. The idle
  // store keeps the hook call unconditional while the Session directory is
  // still arriving.
  const store = cwd === undefined ? stores.idle : stores.forDir(cwd)
  const state = useGitStore(store)

  const snapshot = state.snapshot
  const loading = state.status === 'loading'
  const busy = state.busy
  const refs = state.refs
  const error = state.failure === null ? null : failureText(state.failure, t)
  const perform = store.perform
  const workspaceId = snapshot?.workspace?.id

  const changes = snapshot?.changes ?? { staged: [], unstaged: [], untracked: [], conflicted: [] }
  const changeCount = (changes.staged?.length ?? 0) + (changes.unstaged?.length ?? 0) +
    (changes.untracked?.length ?? 0) + (changes.conflicted?.length ?? 0)
  const branch = snapshot?.branch ?? null
  const repo = snapshot?.repo ?? null

  const headOnly = (refs ?? snapshot?.limits?.refs) === 'head'

  /** One of the renderable postures, or null while the first load runs. */
  const posture = (() => {
    if (cwd === undefined) return sessionsPending ? null : { kind: 'noSessionDir' }
    if (snapshot === null) return null
    if (repo?.isRepo !== true) return { kind: 'notRepo', message: repo?.message }
    if (snapshot.isEmpty === true && (snapshot.commits?.length ?? 0) === 0) return { kind: 'emptyRepo' }
    return null
  })()

  const header = React.createElement(
    'div',
    { className: 'dgit-header' },
    React.createElement('span', { className: 'dgit-brand' }, React.createElement(GitMark, { size: 20 })),
    React.createElement(
      'div',
      { className: 'dgit-heading' },
      React.createElement('span', {
        className: 'dgit-heading-name',
        title: repo?.root ?? snapshot?.workspace?.path ?? cwd,
      }, repo?.isRepo === true
        ? repo.name
        : (snapshot?.workspace?.title ?? t('panel.subtitle'))),
      React.createElement(
        'span',
        { className: 'dgit-heading-meta' },
        repo?.isRepo === true
          ? React.createElement(
              'span',
              {
                className: 'dgit-pill',
                'data-tone': 'brand',
                // A long branch name must ellipsize inside the pill instead of
                // widening the header past the sidebar.
                title: branch?.detached === true
                  ? String(branch.oid ?? '')
                  : (branch?.head ?? t('panel.defaultBranch')),
              },
              React.createElement('span', { className: 'dgit-pill-text' },
                branch?.detached === true
                  ? `${String(branch.oid ?? '').slice(0, 7)}`
                  : (branch?.head ?? t('panel.defaultBranch'))),
            )
          : null,
        React.createElement(Divergence, { branch, t }),
        repo?.isRepo === true && snapshot?.commits?.[0] !== undefined
          ? React.createElement('span', { title: snapshot.commits[0].authorTime },
              relativeTime(snapshot.commits[0].authorTime, language))
          : null,
      ),
    ),
    React.createElement('span', { className: 'dgit-spacer' }),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgit-btn',
        'data-variant': 'ghost',
        title: t('panel.refresh'),
        'aria-label': t('panel.refresh'),
        disabled: loading || cwd === undefined,
        onClick: () => void store.refresh(),
      },
      React.createElement(RefreshIcon, null),
    ),
  )

  const banner = error === null ? null : React.createElement(
    'div',
    { className: 'dgit-banner' },
    React.createElement('span', { className: 'dgit-banner-text' }, error),
    React.createElement('button', {
      type: 'button',
      className: 'dgit-btn',
      'data-variant': 'ghost',
      onClick: () => store.clearFailure(),
    }, t('action.dismiss')),
  )

  if (snapshot === null) {
    // Three waits look different: the Session projection is still arriving, the
    // Session really has no directory, or the repository read is in flight.
    const emptyText = sessionsPending
      ? t('panel.loading')
      : cwd === undefined
        ? t('panel.noSessionDir')
        : loading ? t('panel.loading') : ''
    const retry = sessionsPending || cwd !== undefined
      ? null
      : React.createElement('button', {
          type: 'button',
          className: 'dgit-btn',
          onClick: () => void store.refresh(),
        }, t('panel.retry'))
    return React.createElement(
      'div',
      { className: 'dgit-panel' },
      header,
      banner,
      React.createElement(
        'div',
        { className: 'dgit-empty' },
        React.createElement('span', null, emptyText),
        retry,
      ),
    )
  }

  if (posture !== null) {
    const message = posture.kind === 'noSessionDir'
      ? t('panel.noSessionDir')
      : posture.kind === 'emptyRepo'
        ? t('panel.emptyRepo')
        : `${t('panel.notRepo')}${typeof posture.message === 'string' ? `\n${posture.message}` : ''}`
    return React.createElement(
      'div',
      { className: 'dgit-panel' },
      header,
      banner,
      React.createElement(
        'div',
        { className: 'dgit-empty' },
        React.createElement('span', null, message),
        React.createElement('button', {
          type: 'button',
          className: 'dgit-btn',
          onClick: () => void store.refresh(),
        }, t('panel.retry')),
      ),
    )
  }

  return React.createElement(
    'div',
    { className: 'dgit-panel' },
    header,
    banner,
    React.createElement(
      Tabs.Root,
      { value: tab, onValueChange: value => setTab(value) },
      React.createElement(
        Tabs.List,
        { className: 'dgit-tabs' },
        React.createElement(Tabs.Tab, { className: 'dgit-tab', value: 'graph' },
          React.createElement(TabLabel, { text: t('tab.graph') })),
        React.createElement(Tabs.Tab, { className: 'dgit-tab', value: 'changes' },
          React.createElement(TabLabel, { text: t('tab.changes'), count: changeCount })),
        React.createElement(Tabs.Tab, { className: 'dgit-tab', value: 'branches' },
          React.createElement(TabLabel, { text: t('tab.branches') })),
      ),
      React.createElement(
        Tabs.Panel,
        { className: 'dgit-tabpanel', value: 'graph', keepMounted: true },
        React.createElement(GraphView, {
          commits: snapshot.commits ?? [],
          api,
          workspace: workspaceId,
          language,
          t,
          headOnly,
          onToggleHeadOnly: next => store.setRefs(next ? 'head' : 'all'),
          onRefresh: () => void store.refresh(),
        }),
      ),
      React.createElement(
        Tabs.Panel,
        { className: 'dgit-tabpanel', value: 'changes', keepMounted: true },
        React.createElement(ChangesView, {
          changes,
          api,
          workspace: workspaceId,
          t,
          busy,
          stagedCount: changes.staged?.length ?? 0,
          onAction: perform,
        }),
      ),
      React.createElement(
        Tabs.Panel,
        { className: 'dgit-tabpanel', value: 'branches', keepMounted: true },
        React.createElement(BranchesView, {
          branches: snapshot.branches ?? [],
          worktrees: snapshot.worktrees ?? [],
          t,
          language,
          busy,
          onAction: perform,
        }),
      ),
    ),
  )
}
