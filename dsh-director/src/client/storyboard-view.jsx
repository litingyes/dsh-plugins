/**
 * Storyboard tab: scenes and shot cards, read-only.
 *
 * Only expanded scenes render their cards, so a large production stays cheap in
 * a narrow sidebar. The prompt preview and the copy button are the two things a
 * user actually reaches for here; everything else is orientation.
 *
 * @module @litingyes/dsh-director/client/storyboard-view
 */

import * as React from 'react'
import { CopyButton } from './copy-button.jsx'
import { ChevronIcon } from './icons.jsx'
import {
  clip,
  formatSeconds,
  purposeKey,
  sceneTotals,
  selectedTake,
  statusKey,
} from './format.js'

function Empty({ t }) {
  return React.createElement(
    'div',
    { className: 'ddr-empty' },
    React.createElement('div', { className: 'ddr-empty-title' }, t('storyboard.noScenes')),
  )
}

function ShotCard({ shot, t }) {
  const taken = selectedTake(shot)
  const promptText = typeof shot.prompt?.text === 'string' ? shot.prompt.text : ''
  const ready = promptText.trim() !== ''
  const framing = [shot.shotSize, shot.angle, shot.movement].filter(Boolean).join(' / ')
  const continuity = [
    ...(Array.isArray(shot.continuity?.characters) ? shot.continuity.characters : []),
    ...(Array.isArray(shot.continuity?.props) ? shot.continuity.props : []),
  ]
  const audio = [shot.audio?.vo, shot.audio?.music, ...(Array.isArray(shot.audio?.sfx) ? shot.audio.sfx : [])]
    .filter(Boolean)
    .join(' · ')

  return React.createElement(
    'article',
    { className: 'ddr-shot' },
    React.createElement(
      'div',
      { className: 'ddr-shot-top' },
      React.createElement('span', { className: 'ddr-shot-id' }, shot.id),
      React.createElement('span', { className: 'ddr-shot-duration' }, formatSeconds(shot.durationSec)),
      React.createElement(
        'span',
        { className: 'ddr-chip ddr-status', 'data-status': shot.status },
        t(statusKey(shot.status)),
      ),
      framing === '' ? null : React.createElement('span', { className: 'ddr-chip' }, framing),
      shot.takes?.length > 0
        ? React.createElement(
            'span',
            { className: 'ddr-chip', 'data-tone': taken === null ? 'muted' : 'success' },
            taken === null
              ? t('storyboard.takes', { n: shot.takes.length })
              : t('storyboard.takeSelected', { id: taken.id }),
          )
        : null,
    ),
    shot.action === '' && shot.subject === ''
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-shot-line' },
          shot.subject === '' ? null : React.createElement('span', { className: 'ddr-shot-label' }, `${shot.subject} · `),
          shot.action,
        ),
    shot.dialogue === ''
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-shot-line', 'data-muted': true },
          `「${clip(shot.dialogue, 80)}」`,
        ),
    shot.onScreenText === ''
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-shot-line', 'data-muted': true },
          `字幕：${clip(shot.onScreenText, 80)}`,
        ),
    audio === ''
      ? null
      : React.createElement('div', { className: 'ddr-shot-line', 'data-muted': true }, `♪ ${clip(audio, 90)}`),
    continuity.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-shot-line', 'data-muted': true },
          `${t('storyboard.continuity')}：${continuity.join(' · ')}`,
        ),
    !ready && promptText === ''
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-shot-prompt' },
          ready ? promptText : t('storyboard.noPrompt'),
        ),
    React.createElement(
      'div',
      { className: 'ddr-shot-actions' },
      ready
        ? React.createElement(CopyButton, {
            text: promptText,
            label: t('storyboard.copyPrompt'),
            copiedLabel: t('prompts.copied'),
          })
        : React.createElement('span', { className: 'ddr-chip', 'data-tone': 'muted' }, t('storyboard.noPrompt')),
    ),
  )
}

function SceneSection({ scene, t, open, onToggle }) {
  const totals = sceneTotals(scene)
  const purpose = purposeKey(scene.purpose)
  return React.createElement(
    'section',
    { className: 'ddr-scene' },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'ddr-scene-head',
        onClick: onToggle,
        'aria-expanded': open,
      },
      React.createElement(
        'span',
        { className: 'ddr-chevron', 'data-open': open ? '' : undefined },
        React.createElement(ChevronIcon, { size: 13 }),
      ),
      React.createElement(
        'span',
        { className: 'ddr-scene-title' },
        `${scene.id}${scene.title === '' ? '' : ` · ${scene.title}`}`,
      ),
      purpose === null ? null : React.createElement('span', { className: 'ddr-chip', 'data-tone': 'brand' }, t(purpose)),
      React.createElement(
        'span',
        { className: 'ddr-scene-sub' },
        `${totals.shots} ${t('header.shots')} · ${formatSeconds(totals.seconds)}`,
      ),
    ),
    open
      ? React.createElement(
          'div',
          { className: 'ddr-scene-body' },
          scene.shots.length === 0
            ? React.createElement('div', { className: 'ddr-shot-line', 'data-muted': true }, t('storyboard.noShots'))
            : scene.shots.map(shot => React.createElement(ShotCard, { key: shot.id, shot, t })),
        )
      : null,
  )
}

/**
 * The storyboard tab.
 *
 * @param {{ snapshot: object, t: (key: string, vars?: object) => string }} props data and translator.
 * @returns {React.ReactElement} tab body.
 */
export function StoryboardView({ snapshot, t }) {
  const scenes = Array.isArray(snapshot.storyboard?.scenes) ? snapshot.storyboard.scenes : []
  const [open, setOpen] = React.useState(() => new Set())
  React.useEffect(() => {
    if (scenes.length > 0) setOpen(current => (current.size === 0 ? new Set([scenes[0].id]) : current))
  }, [scenes.length])

  if (scenes.length === 0) return React.createElement(Empty, { t })

  const toggle = id => {
    setOpen(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'ddr-toolbar' },
      React.createElement('span', { className: 'ddr-hint' }, t('panel.stale')),
    ),
    React.createElement(
      'div',
      { className: 'ddr-body' },
      scenes.map(scene =>
        React.createElement(SceneSection, {
          key: scene.id,
          scene,
          t,
          open: open.has(scene.id),
          onToggle: () => toggle(scene.id),
        }),
      ),
    ),
  )
}
