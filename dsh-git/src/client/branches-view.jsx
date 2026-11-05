/**
 * Branch list: switch to an existing local branch, or create one at HEAD.
 *
 * @module @litingyes/dsh-git/client/branches-view
 */

import * as React from 'react'
import { Input } from '@base-ui-components/react/input'
import { BranchIcon, PlusIcon } from './icons.jsx'
import { absoluteTime, relativeTime } from './format.js'

/**
 * One branch row.
 *
 * @param {object} props row props.
 * @returns {React.ReactElement} the row.
 */
function BranchRow({ branch, busy, onSwitch, t, language }) {
  return React.createElement(
    'div',
    { className: 'dgit-filerow', 'data-selected': branch.current ? '' : undefined, style: { cursor: 'default' } },
    React.createElement('span', { className: 'dgit-status', 'data-code': branch.current ? 'A' : 'M' },
      React.createElement(BranchIcon, null)),
    React.createElement(
      'span',
      { className: 'dgit-path', style: { direction: 'ltr' } },
      branch.name,
    ),
    branch.upstream === '' || branch.upstream === undefined
      ? null
      : React.createElement('span', { className: 'dgit-count dgit-branch-upstream', title: branch.upstream },
          `${t('branches.upstream')} ${branch.upstream}`),
    branch.commitTime === ''
      ? null
      : React.createElement('span', { className: 'dgit-count dgit-branch-time', title: absoluteTime(branch.commitTime) },
          relativeTime(branch.commitTime, language)),
    branch.current
      ? React.createElement('span', { className: 'dgit-pill', 'data-tone': 'brand' }, t('branches.current'))
      : React.createElement('button', {
          type: 'button',
          className: 'dgit-btn',
          'data-variant': 'ghost',
          disabled: busy,
          onClick: () => onSwitch(branch.name),
        }, t('branches.switch')),
  )
}

/**
 * The branches view.
 *
 * @param {object} props view props.
 * @returns {React.ReactElement} the view.
 */
export function BranchesView({ branches, t, language, busy, onAction }) {
  const [name, setName] = React.useState('')

  const locals = (branches ?? []).filter(branch => branch.type === 'local')
  const remotes = (branches ?? []).filter(branch => branch.type === 'remote')

  const create = async () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const done = await onAction({ action: 'create-branch', branch: trimmed })
    if (done === true) setName('')
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgit-toolbar' },
      React.createElement(Input, {
        className: 'dgit-input',
        style: { flex: '1 1 240px', maxWidth: 340 },
        placeholder: t('branches.createPlaceholder'),
        value: name,
        onChange: event => setName(event.target.value),
        onKeyDown: event => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void create()
        },
        disabled: busy,
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgit-btn',
          'data-variant': 'primary',
          disabled: busy || name.trim() === '',
          onClick: create,
        },
        React.createElement(PlusIcon, null),
        t('branches.createAction'),
      ),
    ),
    React.createElement(
      'div',
      { className: 'dgit-scroll' },
      React.createElement(
        'div',
        { className: 'dgit-group' },
        React.createElement('div', { className: 'dgit-group-head' },
          React.createElement('span', { className: 'dgit-group-name' }, t('branches.local')),
          React.createElement('span', { className: 'dgit-count' }, String(locals.length))),
        locals.length === 0
          ? React.createElement('div', { className: 'dgit-empty' }, t('branches.none'))
          : locals.map(branch => React.createElement(BranchRow, {
              key: branch.name,
              branch,
              busy,
              language,
              t,
              onSwitch: branchName => onAction({ action: 'checkout', branch: branchName }),
            })),
      ),
      remotes.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'dgit-group' },
            React.createElement('div', { className: 'dgit-group-head' },
              React.createElement('span', { className: 'dgit-group-name' }, t('branches.remote')),
              React.createElement('span', { className: 'dgit-count' }, String(remotes.length))),
            remotes.map(branch => React.createElement('div', {
              key: branch.name,
              className: 'dgit-filerow',
              style: { cursor: 'default' },
            },
            React.createElement('span', { className: 'dgit-status', 'data-code': 'M' }, React.createElement(BranchIcon, null)),
            React.createElement('span', { className: 'dgit-path', style: { direction: 'ltr' } }, branch.name),
            branch.commitTime === ''
              ? null
              : React.createElement('span', { className: 'dgit-count dgit-branch-time' },
                  relativeTime(branch.commitTime, language)))),
          ),
    ),
  )
}
