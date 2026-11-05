/**
 * Worktree dialogs: creating one (on a new or an existing branch), and removing
 * one behind a second confirmation.
 *
 * Both live in their own module so `branches-view.jsx` stays about the list.
 * Each is a small state machine: the create form resets on every open, because
 * remembering a name that was just created invites a double submit, and it
 * stays open after a failed action so a bad path can be corrected without
 * retyping the rest — the panel's banner already explains what the Host refused.
 *
 * Removal follows the same rule as discard in `changes-view.jsx`: nothing is
 * deleted until the dialog sends `confirm: true`, which the Host independently
 * requires, and `force` is an explicit opt-in because it drops uncommitted work.
 *
 * @module @litingyes/dsh-git/client/worktree-dialog
 */

import * as React from 'react'
import { Checkbox } from '@base-ui-components/react/checkbox'
import { Dialog } from '@base-ui-components/react/dialog'
import { Input } from '@base-ui-components/react/input'
import { CheckIcon } from './icons.jsx'

/**
 * Where a worktree goes when the user names no path.
 *
 * Mirrors the Host's own default (`<workspace>/.agents/worktrees/<branch>`), so
 * the pre-filled value the user sees is the directory that will be created.
 */
const WORKTREE_DIR = '.agents/worktrees'

/**
 * The label a worktree row and the remove dialog use for what it holds.
 *
 * Detached heads and bare repositories have no branch to print, and an empty
 * cell would read as a bug, so each posture gets its own words while the short
 * SHA stays in the row's meta line.
 *
 * @param {object | null} worktree one `state.worktrees` entry.
 * @param {(key: string, vars?: object) => string} t translator.
 * @returns {string} the label.
 */
export function worktreeLabel(worktree, t) {
  if (worktree?.bare === true) return t('worktree.bare')
  const branch = worktree?.branch
  if (typeof branch === 'string' && branch !== '') return branch
  const head = typeof worktree?.head === 'string' ? worktree.head : ''
  if (head !== '') return head
  return t('worktree.detached')
}

/**
 * One labelled dialog field.
 *
 * The label wraps the control so a click on the text focuses it; no `for`/`id`
 * pair is needed because the control is its own descendant.
 *
 * @param {{label: string, children: React.ReactNode}} props field props.
 * @returns {React.ReactElement} the field.
 */
function Field({ label, children }) {
  return React.createElement(
    'label',
    { className: 'dgit-dialog-field' },
    React.createElement('span', { className: 'dgit-dialog-label' }, label),
    children,
  )
}

/**
 * The create-worktree dialog.
 *
 * The path field follows the branch name until the user edits it; after that it
 * is theirs, so the default stops moving under the cursor mid-edit.
 *
 * @param {object} props dialog props.
 * @param {boolean} props.open whether the dialog is shown.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {(body: object) => Promise<boolean>} props.onAction panel action runner.
 * @param {() => void} props.onClose close request.
 * @returns {React.ReactElement} the dialog.
 */
export function WorktreeCreateDialog({ open, busy, t, onAction, onClose }) {
  const [branch, setBranch] = React.useState('')
  const [path, setPath] = React.useState('')
  const [pathTouched, setPathTouched] = React.useState(false)
  const [createBranch, setCreateBranch] = React.useState(true)

  React.useEffect(() => {
    if (open !== true) return
    setBranch('')
    setPath('')
    setPathTouched(false)
    setCreateBranch(true)
  }, [open])

  const trimmed = branch.trim()
  const suggested = trimmed === '' ? '' : `${WORKTREE_DIR}/${trimmed}`
  const shownPath = pathTouched ? path : suggested

  const submit = async () => {
    const chosenBranch = branch.trim()
    if (chosenBranch === '') return
    const chosenPath = shownPath.trim()
    const done = await onAction({
      action: 'create-worktree',
      branch: chosenBranch,
      // An empty field means "use the Host's default", not "create at the
      // repository root": omitting the key lets the Host apply its own rule.
      ...(chosenPath === '' ? {} : { path: chosenPath }),
      createBranch,
    })
    if (done === true) onClose()
  }

  const enterToSubmit = (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void submit()
  }

  const mode = (value, label) => React.createElement('button', {
    type: 'button',
    role: 'radio',
    'aria-checked': createBranch === value,
    className: 'dgit-btn',
    'data-variant': createBranch === value ? 'primary' : 'ghost',
    disabled: busy,
    onClick: () => setCreateBranch(value),
  }, label)

  return React.createElement(
    Dialog.Root,
    { open, onOpenChange: next => { if (next !== true) onClose() } },
    React.createElement(
      Dialog.Portal,
      null,
      React.createElement(Dialog.Backdrop, { className: 'dgit-backdrop' }),
      React.createElement(
        Dialog.Popup,
        { className: 'dgit-dialog' },
        React.createElement(Dialog.Title, { className: 'dgit-dialog-title' }, t('worktree.createTitle')),
        React.createElement(
          'div',
          { className: 'dgit-dialog-form' },
          React.createElement(
            Field,
            { label: t('worktree.branchLabel') },
            React.createElement(Input, {
              className: 'dgit-input',
              placeholder: t('worktree.branchPlaceholder'),
              value: branch,
              onChange: event => setBranch(event.target.value),
              onKeyDown: enterToSubmit,
              disabled: busy,
              autoFocus: true,
            }),
          ),
          React.createElement(
            Field,
            { label: t('worktree.pathLabel') },
            React.createElement(Input, {
              className: 'dgit-input',
              placeholder: t('worktree.pathPlaceholder'),
              value: shownPath,
              onChange: event => {
                setPathTouched(true)
                setPath(event.target.value)
              },
              onKeyDown: enterToSubmit,
              disabled: busy,
            }),
          ),
          React.createElement('div', { className: 'dgit-dialog-hint' }, t('worktree.pathHint')),
          React.createElement(
            'div',
            { className: 'dgit-dialog-modes', role: 'radiogroup', 'aria-label': t('worktree.modeLabel') },
            mode(true, t('worktree.modeNew')),
            mode(false, t('worktree.modeExisting')),
          ),
        ),
        React.createElement(
          'div',
          { className: 'dgit-dialog-actions' },
          React.createElement(Dialog.Close, { className: 'dgit-btn' }, t('worktree.cancel')),
          React.createElement('button', {
            type: 'button',
            className: 'dgit-btn',
            'data-variant': 'primary',
            disabled: busy || trimmed === '',
            onClick: () => void submit(),
          }, t('worktree.createAction')),
        ),
      ),
    ),
  )
}

/**
 * The remove-worktree dialog.
 *
 * Rendering nothing while `worktree` is null is deliberate: a closed Base UI
 * root would still run this body, and a half-populated dialog flashing over the
 * panel is worse than no dialog at all.
 *
 * @param {object} props dialog props.
 * @param {object | null} props.worktree the worktree being removed, or null.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {(body: object) => Promise<boolean>} props.onAction panel action runner.
 * @param {() => void} props.onClose close request.
 * @returns {React.ReactElement | null} the dialog.
 */
export function WorktreeRemoveDialog({ worktree, busy, t, onAction, onClose }) {
  const [force, setForce] = React.useState(false)

  // Each open starts unforced: the destructive checkbox must be a fresh choice,
  // never a state left over from the previous worktree.
  React.useEffect(() => {
    setForce(false)
  }, [worktree])

  if (worktree === null || worktree === undefined) return null

  const path = typeof worktree.path === 'string' ? worktree.path : ''
  const shownPath = typeof worktree.displayPath === 'string' && worktree.displayPath !== ''
    ? worktree.displayPath
    : path

  const remove = async () => {
    if (path === '') return
    const done = await onAction({
      action: 'remove-worktree',
      path,
      confirm: true,
      ...(force === true ? { force: true } : {}),
    })
    if (done === true) onClose()
  }

  return React.createElement(
    Dialog.Root,
    { open: true, onOpenChange: next => { if (next !== true) onClose() } },
    React.createElement(
      Dialog.Portal,
      null,
      React.createElement(Dialog.Backdrop, { className: 'dgit-backdrop' }),
      React.createElement(
        Dialog.Popup,
        { className: 'dgit-dialog' },
        React.createElement(Dialog.Title, { className: 'dgit-dialog-title' }, t('worktree.removeTitle')),
        React.createElement(
          Dialog.Description,
          { className: 'dgit-dialog-body' },
          `${t('worktree.removeBody')}\n${t('worktree.branchLabel')}: ${worktreeLabel(worktree, t)}\n${t('worktree.pathLabel')}: ${shownPath}`,
        ),
        React.createElement(
          'div',
          { className: 'dgit-dialog-check' },
          React.createElement(
            Checkbox.Root,
            {
              className: 'dgit-check',
              checked: force,
              onCheckedChange: next => setForce(next === true),
              disabled: busy,
              'aria-label': t('worktree.forceLabel'),
            },
            React.createElement(Checkbox.Indicator, { className: 'dgit-check-ind' },
              React.createElement(CheckIcon, null)),
          ),
          React.createElement(
            'div',
            { className: 'dgit-dialog-check-text' },
            React.createElement('span', { className: 'dgit-dialog-check-label' }, t('worktree.forceLabel')),
            React.createElement('span', { className: 'dgit-dialog-hint' }, t('worktree.forceHint')),
          ),
        ),
        React.createElement(
          'div',
          { className: 'dgit-dialog-actions' },
          React.createElement(Dialog.Close, { className: 'dgit-btn' }, t('worktree.cancel')),
          React.createElement('button', {
            type: 'button',
            className: 'dgit-btn',
            // The destructive colour only appears once the user has agreed to
            // lose uncommitted work; before that the action is a plain remove.
            'data-variant': force === true ? 'danger' : undefined,
            disabled: busy || path === '',
            onClick: () => void remove(),
          }, t('worktree.remove')),
        ),
      ),
    ),
  )
}
