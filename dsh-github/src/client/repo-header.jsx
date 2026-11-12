/**
 * The repository block at the top of the panel: who we are, which repository
 * this Session is about, and the numbers that fit on one line.
 *
 * Presentational only — the panel owns the data and the refresh timing.
 *
 * @module @litingyes/dsh-github/client/repo-header
 */

import * as React from 'react'
import { ForkIcon, LockIcon, RepoIcon, StarIcon } from './icons.jsx'
import { formatCount } from './format.js'

/**
 * Render the repository identity block.
 *
 * @param {{repo: object, viewer: object|null, t: Function, language: 'zh'|'en'}} props header props.
 * @returns {React.ReactElement} the block.
 */
export function RepoHeader({ repo, viewer, t, language }) {
  return React.createElement(
    'div',
    { className: 'dgh-head' },
    React.createElement(
      'div',
      { className: 'dgh-repo' },
      React.createElement(RepoIcon, { size: 15, className: 'dgh-repo-mark' }),
      React.createElement(
        'div',
        { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' } },
        React.createElement(
          'div',
          { className: 'dgh-repo-name', title: repo.fullName },
          repo.fullName,
          repo.private
            ? React.createElement(
                'span',
                { className: 'dgh-badge', style: { marginLeft: '6px' }, title: t('repo.private') },
                React.createElement(LockIcon, { size: 10 }),
                t('repo.private'),
              )
            : null,
        ),
        repo.description === ''
          ? null
          : React.createElement('div', { className: 'dgh-repo-description' }, repo.description),
      ),
    ),
    React.createElement(
      'div',
      { className: 'dgh-meta-row' },
      React.createElement(
        'span',
        { className: 'dgh-meta-item', title: t('repo.stars') },
        React.createElement(StarIcon, { size: 12 }),
        formatCount(repo.stars, language),
      ),
      React.createElement(
        'span',
        { className: 'dgh-meta-item', title: t('repo.forks') },
        React.createElement(ForkIcon, { size: 12 }),
        formatCount(repo.forks, language),
      ),
      repo.defaultBranch === ''
        ? null
        : React.createElement(
            'span',
            { className: 'dgh-meta-item', title: t('repo.defaultBranch') },
            React.createElement('span', { className: 'dgh-mono' }, repo.defaultBranch),
          ),
      viewer === null || viewer.login === ''
        ? null
        : React.createElement('span', { className: 'dgh-meta-item dgh-mono' }, `@${viewer.login}`),
    ),
  )
}
