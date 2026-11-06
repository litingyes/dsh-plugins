/**
 * The chat-page branch chip: current branch, local-branch picker, and the
 * create-and-switch row, in the composer's status dock.
 *
 * The chip is a slot occupant of `conversation.composer.dock`, so the composer
 * bar hands it the Session identity and the Session projection hook; the
 * repository is resolved from that Session's working directory through the
 * shared store, exactly as the right-sidebar panel does. It therefore needs no
 * workspace picker and no second source of truth.
 *
 * The trigger reuses the dock's status-pill metrics so it sits beside the token
 * statistics instead of looking like a toolbar button. The picker is a Base UI
 * Popover, not a Menu: it contains a filter Input, and a menu's typeahead would
 * steal the keystrokes. It portals to the document body and opens upward, which
 * also keeps it out of the composer's containing block and clipping.
 *
 * Switching is immediate and unconfirmed, like the panel's Branches tab. git
 * itself refuses a switch that would overwrite local changes, and that refusal
 * stays visible inside the popover; nothing here resets or forces the working
 * tree.
 *
 * @module @litingyes/dsh-git/client/branch-switch
 */

import * as React from 'react'
import { Popover } from '@base-ui-components/react/popover'
import { Input } from '@base-ui-components/react/input'
import { BranchIcon, CheckIcon, PlusIcon, RefreshIcon } from './icons.jsx'
import { branchLabel, branchSwitchable, changedFileCount, filterBranches } from './branch-list.js'
import { failureText } from './failure.js'
import { useGitStore } from './git-store.js'
import { useTranslate } from './use-translate.js'

/**
 * A session projection hook for a composition that gives no session.
 *
 * The slot always supplies `useSessions`, but keeping one hook identity across
 * renders is what keeps the call order stable.
 */
function useNoSessions() {
  return undefined
}

/**
 * One row of the picker list.
 *
 * The current branch is a marked non-button: clicking it would be a no-op that
 * looks like a failed click. A held branch keeps its row (so the user can see
 * where the branch lives) but its button is disabled with the holder path in
 * the tooltip, because git would refuse the checkout anyway.
 *
 * @param {object} props row props.
 * @param {object} props.branch one local `state.branches` entry.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {string | null} props.pending branch the running action targets.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {(name: string) => void} props.onChoose switch request.
 * @returns {React.ReactElement} the row.
 */
function BranchRow({ branch, busy, pending, t, onChoose }) {
  const name = String(branch.name ?? '')
  const held = typeof branch.worktreePath === 'string' && branch.worktreePath !== ''
  const waiting = pending === name

  if (branch.current === true) {
    return React.createElement(
      'div',
      {
        className: 'dgit-branchpop-row',
        'data-current': '',
        'aria-current': 'true',
        title: name,
      },
      React.createElement(CheckIcon, { className: 'dgit-branchpop-mark' }),
      React.createElement('span', { className: 'dgit-branchpop-name' }, name),
      React.createElement(
        'span',
        { className: 'dgit-branchpop-state' },
        t('branch.current'),
      ),
    )
  }

  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'dgit-branchpop-row',
      disabled: busy || !branchSwitchable(branch),
      title: waiting ? t('branch.switching') : held ? t('worktree.inUse', { path: branch.worktreePath }) : name,
      'aria-busy': waiting ? true : undefined,
      'data-pending': waiting ? '' : undefined,
      onClick: () => onChoose(name),
    },
    React.createElement(
      'span',
      { className: 'dgit-branchpop-mark' },
      waiting ? React.createElement('span', { className: 'dgit-branchpop-spin' }) : null,
    ),
    React.createElement('span', { className: 'dgit-branchpop-name' }, name),
    held
      ? React.createElement(
          'span',
          { className: 'dgit-branchpop-badge', title: branch.worktreePath },
          t('worktree.badge'),
        )
      : null,
  )
}

/**
 * The header branch control.
 *
 * @param {object} props slot props.
 * @param {string | undefined} props.sessionId Session rendered by the header.
 * @param {(selector: Function) => unknown} [props.useSessions] session projection hook.
 * @param {object} props.stores shared per-directory store lookup.
 * @param {object | undefined} props.locale Client locale service.
 * @returns {React.ReactElement | null} the chip, or null without a repository.
 */
export function BranchSwitcher({ sessionId, useSessions, stores, locale }) {
  const { t } = useTranslate(locale)
  const useSessionsHook = typeof useSessions === 'function' ? useSessions : useNoSessions
  const rawCwd = useSessionsHook(all =>
    sessionId === undefined ? undefined : all?.byId?.[sessionId]?.cwd)
  const cwd = typeof rawCwd === 'string' && rawCwd !== '' ? rawCwd : undefined

  // One store per repository, shared with the right-sidebar panel: a switch in
  // either surface moves this chip and that panel together.
  const store = cwd === undefined ? stores.idle : stores.forDir(cwd)
  const state = useGitStore(store)

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const searchRef = React.useRef(null)

  // A different repository must not inherit the previous one's open picker.
  React.useEffect(() => {
    setOpen(false)
  }, [store])

  const snapshot = state.snapshot
  const repo = snapshot?.repo ?? null
  const branch = snapshot?.branch ?? null
  const label = branchLabel(branch, t)
  const dirty = changedFileCount(snapshot?.changes)
  const busy = state.busy
  const failure = state.failure

  const changeOpen = (next) => {
    setOpen(next)
    if (next !== true) return
    // The branch can change outside this plugin (the agent, a terminal), so
    // every open starts from a fresh read; the list is cheap while cached.
    setQuery('')
    setDraft('')
    store.clearFailure()
    void store.refresh()
  }

  const choose = async (name) => {
    const done = await store.perform({ action: 'checkout', branch: name })
    if (done) setOpen(false)
  }

  const create = async () => {
    const name = draft.trim()
    if (name === '') return
    const done = await store.perform({ action: 'create-branch', branch: name })
    if (done) {
      setDraft('')
      setOpen(false)
    }
  }

  // The chip is silent when the Session has no repository to describe: no
  // working directory, a directory outside the registered workspaces, or a
  // non-repository directory. The panel remains the place that explains those
  // postures; the header is not the place for a permanent error line.
  if (cwd === undefined || snapshot === null || repo?.isRepo !== true) return null

  const locals = filterBranches(snapshot.branches, query)
  const firstSwitchable = locals.find(item => branchSwitchable(item))

  const trigger = React.createElement(
    Popover.Trigger,
    {
      className: 'dgit-branchchip',
      'data-tone': branch?.detached === true ? 'warn' : undefined,
      'data-open': open ? '' : undefined,
      // A detached HEAD's visible label is the short id, so the native tooltip
      // carries the full one; otherwise the label is already the branch name.
      title: branch?.detached === true ? String(branch.oid ?? '') : t('branch.chipLabel'),
      'aria-label': `${t('branch.chipLabel')}: ${label}`,
    },
    React.createElement(BranchIcon, { className: 'dgit-branchchip-icon' }),
    React.createElement('span', { className: 'dgit-branchchip-label' }, label),
    dirty === 0
      ? null
      : React.createElement('span', {
          className: 'dgit-branchchip-dot',
          title: t('branch.dirty', { n: dirty }),
        }),
  )

  const head = React.createElement(
    'div',
    { className: 'dgit-branchpop-head' },
    React.createElement(Popover.Title, { className: 'dgit-branchpop-title' }, t('branch.title')),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgit-btn',
        'data-variant': 'ghost',
        title: t('panel.refresh'),
        'aria-label': t('panel.refresh'),
        disabled: busy || state.status === 'loading',
        onClick: () => void store.refresh(),
      },
      React.createElement(RefreshIcon, null),
    ),
  )

  const note = branch?.detached === true
    ? React.createElement('p', { className: 'dgit-branchpop-note' }, t('branch.detachedHint'))
    : null

  const search = React.createElement(Input, {
    ref: searchRef,
    className: 'dgit-input dgit-branchpop-search',
    placeholder: t('branch.search'),
    'aria-label': t('branch.search'),
    value: query,
    disabled: busy,
    onChange: event => setQuery(event.target.value),
    onKeyDown: (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (firstSwitchable !== undefined) void choose(firstSwitchable.name)
    },
  })

  const list = locals.length === 0
    ? React.createElement(
        'div',
        { className: 'dgit-branchpop-empty' },
        query.trim() === '' ? t('branch.none') : t('branch.noMatch'),
      )
    : locals.map(item => React.createElement(BranchRow, {
        key: item.name,
        branch: item,
        busy,
        pending: state.pending,
        t,
        onChoose: name => void choose(name),
      }))

  const failureLine = failure === null
    ? null
    : React.createElement(
        'div',
        { className: 'dgit-branchpop-error', role: 'alert' },
        React.createElement('span', { className: 'dgit-branchpop-error-label' }, t('action.failed')),
        React.createElement('span', { className: 'dgit-branchpop-error-text' }, failureText(failure, t)),
      )

  const creator = React.createElement(
    'div',
    { className: 'dgit-branchpop-new' },
    React.createElement(Input, {
      className: 'dgit-input dgit-branchpop-create',
      placeholder: t('branch.newPlaceholder'),
      'aria-label': t('branch.newPlaceholder'),
      value: draft,
      disabled: busy,
      onChange: event => setDraft(event.target.value),
      onKeyDown: (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        void create()
      },
    }),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgit-btn',
        'data-variant': 'primary',
        disabled: busy || draft.trim() === '',
        onClick: () => void create(),
      },
      React.createElement(PlusIcon, null),
      t('branches.createAction'),
    ),
  )

  const body = React.createElement(
    Popover.Popup,
    { className: 'dgit-branchpop', initialFocus: searchRef },
    head,
    note,
    search,
    React.createElement('div', { className: 'dgit-branchpop-list' }, list),
    failureLine,
    creator,
  )

  const portal = React.createElement(
    Popover.Portal,
    null,
    React.createElement(
      Popover.Positioner,
      {
        className: 'dgit-branchpop-positioner',
        side: 'top',
        align: 'center',
        sideOffset: 8,
        collisionPadding: 12,
      },
      body,
    ),
  )

  return React.createElement(Popover.Root, { open, onOpenChange: changeOpen }, trigger, portal)
}
