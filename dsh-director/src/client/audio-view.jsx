/**
 * Audio tab: the voice-over / music / sound-effect plan, read-only.
 *
 * Tracks are grouped by kind because that is how they are produced: voice-over
 * is recorded first, music is chosen next, effects are placed last.
 *
 * @module @litingyes/dsh-director/client/audio-view
 */

import * as React from 'react'
import { CopyButton } from './copy-button.jsx'
import { formatClock, formatSeconds } from './format.js'

const KINDS = [
  ['vo', 'audio.vo'],
  ['music', 'audio.music'],
  ['sfx', 'audio.sfx'],
]

function targetLabel(track, t) {
  const parts = []
  if (track.sceneId !== '') parts.push(track.sceneId)
  if (Array.isArray(track.shotIds) && track.shotIds.length > 0) parts.push(track.shotIds.join(','))
  return parts.length === 0 ? t('audio.wholeFilm') : parts.join(' / ')
}

function AudioRow({ track, t }) {
  const timing = [
    track.startSec > 0 || track.durationSec > 0 ? formatClock(track.startSec) : '',
    track.durationSec > 0 ? formatSeconds(track.durationSec) : '',
  ]
    .filter(Boolean)
    .join(' + ')
  return React.createElement(
    'div',
    { className: 'ddr-audio-row' },
    React.createElement(
      'div',
      { className: 'ddr-audio-top' },
      React.createElement('span', { className: 'ddr-audio-id' }, track.id),
      React.createElement('span', { className: 'ddr-chip' }, targetLabel(track, t)),
      timing === '' ? null : React.createElement('span', { className: 'ddr-audio-meta' }, timing),
      track.text === '' || track.kind !== 'vo'
        ? null
        : React.createElement(
            'span',
            { style: { marginLeft: 'auto' } },
            React.createElement(CopyButton, {
              text: track.text,
              label: t('audio.copyText'),
              copiedLabel: t('prompts.copied'),
            }),
          ),
    ),
    React.createElement(
      'div',
      { className: track.text === '' ? 'ddr-shot-line' : 'ddr-audio-text', 'data-muted': track.text === '' ? true : undefined },
      track.text === '' ? t('audio.noText') : track.text,
    ),
    track.file === ''
      ? null
      : React.createElement('div', { className: 'ddr-audio-meta' }, track.file),
    track.notes === ''
      ? null
      : React.createElement('div', { className: 'ddr-shot-line', 'data-muted': true }, track.notes),
  )
}

/**
 * The audio tab.
 *
 * @param {{ snapshot: object, t: (key: string, vars?: object) => string }} props data and translator.
 * @returns {React.ReactElement} tab body.
 */
export function AudioView({ snapshot, t }) {
  const tracks = Array.isArray(snapshot.audio?.tracks) ? snapshot.audio.tracks : []
  if (tracks.length === 0) {
    return React.createElement(
      'div',
      { className: 'ddr-empty' },
      React.createElement('div', { className: 'ddr-empty-title' }, t('audio.noTracks')),
    )
  }
  const groups = KINDS.map(([kind, key]) => ({
    kind,
    key,
    tracks: tracks.filter(track => track.kind === kind),
  })).filter(group => group.tracks.length > 0)
  const others = tracks.filter(track => !KINDS.some(([kind]) => kind === track.kind))
  if (others.length > 0) groups.push({ kind: 'other', key: 'audio.other', tracks: others })

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'ddr-toolbar', style: { paddingTop: '11px', paddingLeft: '13px', paddingRight: '13px' } },
      React.createElement('span', { className: 'ddr-hint' }, t('panel.stale')),
    ),
    React.createElement(
      'div',
      { className: 'ddr-body' },
      groups.map(group =>
        React.createElement(
          'section',
          { className: 'ddr-audio-group', key: group.kind },
          React.createElement(
            'div',
            { className: 'ddr-audio-head' },
            t(group.key),
            React.createElement('span', { className: 'ddr-tab-count' }, group.tracks.length),
          ),
          group.tracks.map(track => React.createElement(AudioRow, { key: track.id, track, t })),
        ),
      ),
    ),
  )
}
