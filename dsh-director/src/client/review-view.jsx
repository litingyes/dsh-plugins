/**
 * Review tab: the same findings the `video_review` tool returns.
 *
 * Rows are collapsed by default so the list stays scannable; the summary shows
 * the Chinese/English name for the finding code and the file path, and opening
 * one shows the model-facing detail plus the fix. The detail text comes from the
 * Host (English, with the concrete ids and durations) — translating a message
 * that embeds data would lose the data.
 *
 * @module @litingyes/dsh-director/client/review-view
 */

import * as React from 'react'
import { reviewCodeKey } from './format.js'

const SEVERITIES = [
  ['error', 'review.error'],
  ['warning', 'review.warning'],
  ['info', 'review.info'],
]

const SEVERITY_TONE = { error: 'error', warning: 'warn', info: 'muted' }

function Finding({ item, t }) {
  return React.createElement(
    'details',
    { className: 'ddr-finding', 'data-severity': item.severity },
    React.createElement(
      'summary',
      null,
      React.createElement(
        'span',
        { className: 'ddr-chip', 'data-tone': SEVERITY_TONE[item.severity] ?? 'muted', style: { flex: 'none' } },
        item.severity === 'error' ? '!' : item.severity === 'warning' ? '△' : 'i',
      ),
      React.createElement(
        'span',
        { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' } },
        React.createElement('span', { className: 'ddr-finding-name' }, t(reviewCodeKey(item.code))),
        React.createElement('span', { className: 'ddr-finding-path' }, item.path),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ddr-finding-body' },
      React.createElement('div', null, item.message),
      React.createElement('div', { className: 'ddr-finding-fix' }, `${t('review.fix')}：${item.fix}`),
    ),
  )
}

/**
 * The review tab.
 *
 * @param {{ snapshot: object, t: (key: string, vars?: object) => string }} props data and translator.
 * @returns {React.ReactElement} tab body.
 */
export function ReviewView({ snapshot, t }) {
  const review = snapshot.review ?? null
  const findings = Array.isArray(review?.findings) ? review.findings : []
  const next = Array.isArray(review?.next) ? review.next : []
  const counts = { error: 0, warning: 0, info: 0 }
  for (const finding of findings) {
    if (Object.hasOwn(counts, finding.severity)) counts[finding.severity] += 1
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'ddr-toolbar', style: { paddingTop: '11px', paddingLeft: '13px', paddingRight: '13px' } },
      ...SEVERITIES.map(([severity, key]) =>
        React.createElement(
          'span',
          {
            key: severity,
            className: 'ddr-chip',
            'data-tone': counts[severity] > 0 ? SEVERITY_TONE[severity] : 'muted',
          },
          `${t(key)} ${counts[severity]}`,
        ),
      ),
      React.createElement('span', { className: 'ddr-hint' }, t('panel.stale')),
    ),
    React.createElement(
      'div',
      { className: 'ddr-body' },
      next.length === 0
        ? null
        : React.createElement(
            'div',
            { className: 'ddr-next' },
            React.createElement('div', { className: 'ddr-next-title' }, t('review.next')),
            next.map((action, index) =>
              React.createElement('div', { className: 'ddr-next-item', key: index }, `· ${action}`),
            ),
          ),
      findings.length === 0
        ? React.createElement(
            'div',
            { className: 'ddr-empty' },
            React.createElement('div', { className: 'ddr-empty-title' }, t('review.empty')),
          )
        : SEVERITIES.map(([severity, key]) => {
            const group = findings.filter(finding => finding.severity === severity)
            if (group.length === 0) return null
            return React.createElement(
              'section',
              { className: 'ddr-review-group', key: severity },
              React.createElement(
                'div',
                { className: 'ddr-review-head', 'data-severity': severity },
                t(key),
                React.createElement('span', { className: 'ddr-tab-count' }, group.length),
              ),
              group.slice(0, 40).map((finding, index) =>
                React.createElement(Finding, { key: `${finding.code}-${finding.path}-${index}`, item: finding, t }),
              ),
              group.length > 40
                ? React.createElement('div', { className: 'ddr-hint' }, t('review.more', { n: group.length - 40 }))
                : null,
            )
          }),
      review?.truncated === true
        ? React.createElement('div', { className: 'ddr-banner' }, t('review.truncated'))
        : null,
    ),
  )
}
