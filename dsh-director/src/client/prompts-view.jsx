/**
 * Prompts tab: the paste-ready output, shot by shot.
 *
 * This is the tab the whole plugin exists for. Each shot shows the three pieces
 * a generation platform asks for — positive prompt, negative prompt, parameters
 * — each with its own copy button, because they go into different fields. The
 * scene/film copy and the Markdown download use the same shared formatter as the
 * `video_prompt` tool, so what the user copies here is exactly what the agent
 * would hand them in the conversation.
 *
 * @module @litingyes/dsh-director/client/prompts-view
 */

import * as React from 'react'
import { CopyButton } from './copy-button.jsx'
import { ChevronIcon, DownloadIcon } from './icons.jsx'
import { formatSeconds, statusKey } from './format.js'
import { paramEntries, paramLine, promptBlock, promptFields, promptSheet } from '../shared/prompt.js'

function slug(text) {
  const cleaned = String(text ?? '')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
  return cleaned === '' ? 'ai-video' : cleaned
}

/** Save the sheet as a file without touching the server. */
function downloadMarkdown(filename, text) {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function ShotPrompt({ scene, shot, project, language, t }) {
  const enriched = React.useMemo(() => ({ ...shot, sceneId: scene.id }), [shot, scene.id])
  const fields = promptFields(enriched, project)
  const entries = paramEntries(fields, language)
  const block = promptBlock(enriched, project, { language, headingLevel: 3 })
  const copyLabel = t('prompts.copy')
  const copiedLabel = t('prompts.copied')

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
      fields.product === ''
        ? null
        : React.createElement('span', { className: 'ddr-chip', 'data-tone': 'brand' }, fields.product),
      React.createElement(
        'span',
        { style: { marginLeft: 'auto' } },
        React.createElement(CopyButton, { text: block, label: copyLabel, copiedLabel }),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ddr-prompt' },
      React.createElement(
        'div',
        { className: 'ddr-prompt-head' },
        React.createElement('span', { className: 'ddr-label' }, t('prompts.positive')),
        React.createElement(CopyButton, { text: fields.text, label: copyLabel, copiedLabel }),
      ),
      React.createElement(
        'div',
        { className: 'ddr-prompt-text', 'data-empty': fields.text === '' ? '' : undefined },
        fields.text === '' ? t('prompts.emptyBlock') : fields.text,
      ),
    ),
    React.createElement(
      'div',
      { className: 'ddr-prompt' },
      React.createElement(
        'div',
        { className: 'ddr-prompt-head' },
        React.createElement('span', { className: 'ddr-label' }, t('prompts.negative')),
        React.createElement(CopyButton, { text: fields.negative, label: copyLabel, copiedLabel }),
      ),
      React.createElement(
        'div',
        { className: 'ddr-prompt-text', 'data-empty': fields.negative === '' ? '' : undefined },
        fields.negative === '' ? t('prompts.emptyBlock') : fields.negative,
      ),
    ),
    entries.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'ddr-prompt' },
          React.createElement(
            'div',
            { className: 'ddr-prompt-head' },
            React.createElement('span', { className: 'ddr-label' }, t('prompts.params')),
            React.createElement(CopyButton, {
              text: paramLine(fields, language),
              label: copyLabel,
              copiedLabel,
            }),
          ),
          React.createElement(
            'div',
            { className: 'ddr-params' },
            entries.map(entry =>
              React.createElement(
                'span',
                { className: 'ddr-param', key: entry.key },
                `${entry.label} `,
                React.createElement('b', null, entry.value),
              ),
            ),
          ),
        ),
  )
}

function SceneSection({ scene, project, storyboard, language, t, open, onToggle }) {
  const sheet = React.useMemo(
    () => promptSheet({ project, storyboard: { ...storyboard, scenes: [scene] }, language, sceneId: scene.id }),
    [project, storyboard, scene, language],
  )
  const shots = Array.isArray(scene.shots) ? scene.shots : []
  return React.createElement(
    'section',
    { className: 'ddr-scene' },
    React.createElement(
      'div',
      { className: 'ddr-scene-head' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'ddr-btn',
          'data-variant': 'ghost',
          style: { height: '22px', padding: 0, width: '20px', flex: 'none' },
          onClick: onToggle,
          'aria-expanded': open,
          'aria-label': open ? t('storyboard.collapse') : t('storyboard.expand'),
        },
        React.createElement(
          'span',
          { className: 'ddr-chevron', 'data-open': open ? '' : undefined },
          React.createElement(ChevronIcon, { size: 13 }),
        ),
      ),
      React.createElement(
        'span',
        { className: 'ddr-scene-title', onClick: onToggle, style: { cursor: 'pointer' } },
        `${scene.id}${scene.title === '' ? '' : ` · ${scene.title}`}`,
      ),
      React.createElement('span', { className: 'ddr-scene-sub' }, `${shots.length} ${t('header.shots')}`),
      React.createElement(CopyButton, {
        text: sheet,
        label: t('prompts.copyScene'),
        copiedLabel: t('prompts.copied'),
        className: 'ddr-scene-copy',
      }),
    ),
    open
      ? React.createElement(
          'div',
          { className: 'ddr-scene-body' },
          shots.length === 0
            ? React.createElement('div', { className: 'ddr-shot-line', 'data-muted': true }, t('storyboard.noShots'))
            : shots.map(shot =>
                React.createElement(ShotPrompt, {
                  key: shot.id,
                  scene,
                  shot,
                  project,
                  language,
                  t,
                }),
              ),
        )
      : null,
  )
}

/**
 * The prompts tab.
 *
 * @param {{
 *   snapshot: object,
 *   language: 'zh' | 'en',
 *   t: (key: string, vars?: object) => string,
 * }} props data and translator.
 * @returns {React.ReactElement} tab body.
 */
export function PromptsView({ snapshot, language, t }) {
  const storyboard = snapshot.storyboard ?? { scenes: [] }
  const project = snapshot.project ?? null
  const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : []
  const [open, setOpen] = React.useState(() => new Set())
  React.useEffect(() => {
    if (scenes.length > 0) setOpen(current => (current.size === 0 ? new Set([scenes[0].id]) : current))
  }, [scenes.length])

  const sheet = React.useMemo(
    () => promptSheet({ project, storyboard, language }),
    [project, storyboard, language],
  )

  if (scenes.length === 0) {
    return React.createElement(
      'div',
      { className: 'ddr-empty' },
      React.createElement('div', { className: 'ddr-empty-title' }, t('prompts.noScenes')),
    )
  }

  const toggle = id => {
    setOpen(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const products = Array.isArray(project?.products) ? project.products : []

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'ddr-toolbar', style: { paddingTop: '11px', paddingLeft: '13px', paddingRight: '13px' } },
      React.createElement(CopyButton, { text: sheet, label: t('prompts.copyAll'), copiedLabel: t('prompts.copied') }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'ddr-btn',
          onClick: () => downloadMarkdown(`${slug(project?.title)}-prompts.md`, sheet),
        },
        React.createElement(DownloadIcon, { size: 13 }),
        React.createElement('span', null, t('prompts.download')),
      ),
      products.length === 0
        ? null
        : React.createElement('span', { className: 'ddr-hint' }, `${t('prompts.products')}：${products.join(' · ')}`),
      React.createElement('span', { className: 'ddr-hint' }, t('panel.stale')),
    ),
    React.createElement(
      'div',
      { className: 'ddr-body' },
      scenes.map(scene =>
        React.createElement(SceneSection, {
          key: scene.id,
          scene,
          project,
          storyboard,
          language,
          t,
          open: open.has(scene.id),
          onToggle: () => toggle(scene.id),
        }),
      ),
    ),
  )
}
