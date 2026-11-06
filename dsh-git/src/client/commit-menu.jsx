/**
 * The commit node's context menu and the one dialog it can open.
 *
 * Copy SHA is the only item that cannot fail. The other three rewrite or replay
 * history, so each is offered through the availability rules in
 * `commit-actions.js`, and Drop — the only one that removes work from the branch
 * — repeats the panel's two-step confirmation rule: the dialog sends
 * `confirm: true`, and the Host requires it again.
 *
 * @module @litingyes/dsh-git/client/commit-menu
 */

import * as React from 'react'
import { Dialog } from '@base-ui-components/react/dialog'
import { refusalText } from './menu.jsx'

/**
 * Build the four items of one commit menu.
 *
 * @param {object} options item options.
 * @param {object} options.commit the node's commit.
 * @param {{cherryPick: object, revert: object, drop: object}} options.availability from `commitActionState`.
 * @param {(key: string) => string} options.t translator.
 * @param {(commit: object) => void} options.onCopy copy the full SHA.
 * @param {(commit: object) => void} options.onCherryPick apply it to HEAD.
 * @param {(commit: object) => void} options.onRevert revert it on HEAD.
 * @param {(commit: object) => void} options.onDrop open the confirmation dialog.
 * @returns {object[]} menu items for `ContextActions`.
 */
export function commitMenuItems({ commit, availability, t, onCopy, onCherryPick, onRevert, onDrop }) {
  return [
    {
      key: 'copy',
      label: t('graph.copySha'),
      onSelect: () => onCopy(commit),
    },
    {
      key: 'cherry-pick',
      label: t('graph.cherryPick'),
      disabled: availability.cherryPick.enabled !== true,
      reason: refusalText(availability.cherryPick, t),
      onSelect: () => onCherryPick(commit),
    },
    {
      key: 'revert',
      label: t('graph.revert'),
      disabled: availability.revert.enabled !== true,
      reason: refusalText(availability.revert, t),
      onSelect: () => onRevert(commit),
    },
    {
      key: 'drop',
      label: t('graph.drop'),
      tone: 'danger',
      separatorBefore: true,
      disabled: availability.drop.enabled !== true,
      reason: refusalText(availability.drop, t),
      onSelect: () => onDrop(commit),
    },
  ]
}

/**
 * The drop-commit confirmation.
 *
 * Rendering nothing while no commit is pending is deliberate: a closed Base UI
 * root still runs this body, and a half-populated dialog over the graph is worse
 * than no dialog.
 *
 * @param {object} props dialog props.
 * @param {object|null} props.commit the commit that would be dropped, or null.
 * @param {boolean} props.busy whether an action is in flight.
 * @param {(key: string, vars?: object) => string} props.t translator.
 * @param {() => void} props.onConfirm send the confirmed action.
 * @param {() => void} props.onClose close request.
 * @returns {React.ReactElement|null} the dialog.
 */
export function DropCommitDialog({ commit, busy, t, onConfirm, onClose }) {
  if (commit === null || commit === undefined) return null

  const subject = typeof commit.subject === 'string' ? commit.subject : ''
  const short = typeof commit.short === 'string' && commit.short !== '' ? commit.short : String(commit.sha ?? '')

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
        React.createElement(Dialog.Title, { className: 'dgit-dialog-title' }, t('graph.dropTitle')),
        React.createElement(
          Dialog.Description,
          { className: 'dgit-dialog-body' },
          `${short} · ${subject}\n\n${t('graph.dropBody')}`,
        ),
        React.createElement(
          'div',
          { className: 'dgit-dialog-actions' },
          React.createElement(Dialog.Close, { className: 'dgit-btn' }, t('changes.cancel')),
          React.createElement('button', {
            type: 'button',
            className: 'dgit-btn',
            'data-variant': 'danger',
            disabled: busy,
            onClick: onConfirm,
          }, t('graph.dropConfirm')),
        ),
      ),
    ),
  )
}
