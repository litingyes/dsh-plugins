/**
 * Prompt formatting shared by the Host and the browser half.
 *
 * One formatter, two consumers: `video_prompt` (and the review's duration rule)
 * on the Host, and the copy buttons / Markdown download in the right-sidebar
 * panel. Keeping it here is what makes "copy this prompt" and "give me the
 * prompt sheet" produce byte-identical text instead of two drifting formats.
 *
 * The output deliberately separates the three things a generation platform
 * asks for — positive prompt, negative prompt, parameters — because the user
 * pastes them into different fields. A single blob with `Negative:` inside the
 * positive prompt is the most common way a good prompt gets misread.
 *
 * @module @litingyes/dsh-director/shared/prompt
 */

/** Parameter keys in the order the panel and the sheet show them. */
export const PARAM_KEYS = ['duration', 'aspect', 'firstFrame', 'lastFrame', 'references', 'seed', 'extra']

/** Human labels for both supported languages. */
export const LABELS = Object.freeze({
  zh: {
    prompt: '正向提示词',
    negative: '负向提示词',
    params: '参数',
    empty: '（空）',
    duration: '时长',
    aspect: '比例',
    firstFrame: '首帧',
    lastFrame: '尾帧',
    references: '参考图',
    seed: '种子',
    extra: '其他',
    sheetTitle: '提示词清单',
    target: '目标',
    planned: '计划',
    scene: '场景',
  },
  en: {
    prompt: 'Prompt',
    negative: 'Negative',
    params: 'Params',
    empty: '(empty)',
    duration: 'duration',
    aspect: 'aspect',
    firstFrame: 'first frame',
    lastFrame: 'last frame',
    references: 'references',
    seed: 'seed',
    extra: 'extra',
    sheetTitle: 'Prompt sheet',
    target: 'target',
    planned: 'planned',
    scene: 'Scene',
  },
})

/** Resolve a language tag to a supported label set. */
export function labelsFor(language) {
  return language === 'zh' ? LABELS.zh : LABELS.en
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberText(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : ''
}

function pathList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const path = text(item)
    if (path !== '' && !out.includes(path)) out.push(path)
  }
  return out
}

/**
 * The three paste-ready pieces of one shot, plus the labels the sheet needs.
 *
 * @param {object | null} shot one shot from `storyboard.json`.
 * @param {object | null} project the project, for the aspect fallback.
 * @returns {object} `{ shotId, sceneId, durationSec, product, text, negative, params }`.
 */
export function promptFields(shot, project) {
  const prompt = shot?.prompt !== null && typeof shot?.prompt === 'object' ? shot.prompt : {}
  const params = prompt.params !== null && typeof prompt.params === 'object' ? prompt.params : {}
  const durationSec = Number.isFinite(shot?.durationSec) ? shot.durationSec : 0
  return {
    shotId: text(shot?.id),
    sceneId: text(shot?.sceneId),
    durationSec,
    product: text(prompt.product),
    text: text(prompt.text),
    negative: text(prompt.negative),
    params: {
      duration: text(params.duration) || (durationSec > 0 ? `${numberText(durationSec)}s` : ''),
      aspect: text(params.aspect) || text(project?.aspect),
      firstFrame: text(params.firstFrame),
      lastFrame: text(params.lastFrame),
      references: pathList(params.references),
      seed: text(params.seed),
      extra: text(params.extra),
    },
  }
}

/**
 * The non-empty parameters as labelled entries, in fixed order.
 *
 * @param {ReturnType<typeof promptFields>} fields formatted shot.
 * @param {'zh' | 'en'} language label language.
 * @returns {Array<{ key: string, label: string, value: string }>} entries.
 */
export function paramEntries(fields, language = 'en') {
  const labels = labelsFor(language)
  const out = []
  for (const key of PARAM_KEYS) {
    const value = Array.isArray(fields.params[key]) ? fields.params[key].join(', ') : fields.params[key]
    if (typeof value !== 'string' || value === '') continue
    out.push({ key, label: labels[key], value })
  }
  return out
}

/**
 * One line for the copy-params button: `时长 5s · 比例 9:16 · 参考图 a.png`.
 *
 * @param {ReturnType<typeof promptFields>} fields formatted shot.
 * @param {'zh' | 'en'} language label language.
 * @returns {string} parameter line, possibly empty.
 */
export function paramLine(fields, language = 'en') {
  return paramEntries(fields, language)
    .map(entry => `${entry.label} ${entry.value}`)
    .join(' · ')
}

/**
 * One Markdown block for a shot. Used by the sheet, the panel's preview and the
 * `video_prompt` tool's `markdown` output.
 *
 * @param {object} shot one shot.
 * @param {object | null} project the project.
 * @param {{ language?: 'zh' | 'en', headingLevel?: number, scene?: object | null }} [options] formatting.
 * @returns {string} Markdown block.
 */
export function promptBlock(shot, project, options = {}) {
  const language = options.language === 'zh' ? 'zh' : 'en'
  const labels = labelsFor(language)
  const fields = promptFields(shot, project)
  const level = '#'.repeat(Math.min(Math.max(options.headingLevel ?? 3, 2), 6))
  const motion = [text(shot?.shotSize), text(shot?.movement)].filter(Boolean).join(' / ')
  const meta = [
    fields.durationSec > 0 ? `${numberText(fields.durationSec)}s` : '',
    motion,
    fields.product,
  ]
    .filter(Boolean)
    .join(' · ')
  const lines = [`${level} ${fields.shotId}${meta === '' ? '' : ` · ${meta}`}`]
  lines.push('', `**${labels.prompt}**`, '', fields.text === '' ? labels.empty : fields.text, '')
  lines.push(`**${labels.negative}**`, '', fields.negative === '' ? labels.empty : fields.negative, '')
  const params = paramEntries(fields, language)
  if (params.length > 0) {
    lines.push(`**${labels.params}**`, '')
    for (const entry of params) lines.push(`- ${entry.label}: ${entry.value}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

/**
 * The whole prompt sheet, scene by scene. This is the artifact the user pastes
 * from (or downloads) — every shot, in film order, with its three fields split.
 *
 * @param {{
 *   project: object | null,
 *   storyboard: object | null,
 *   language?: 'zh' | 'en',
 *   sceneId?: string,
 * }} options production and format.
 * @returns {string} Markdown sheet.
 */
export function promptSheet(options) {
  const language = options.language === 'zh' ? 'zh' : 'en'
  const labels = labelsFor(language)
  const project = options.project ?? null
  const storyboard = options.storyboard ?? null
  const title = text(project?.title) || 'AI Video'
  const lines = [`# ${title} — ${labels.sheetTitle}`, '']
  if (text(project?.logline) !== '') lines.push(`> ${text(project.logline)}`, '')
  const totals = [
    text(project?.aspect) === '' ? '' : `${labels.aspect} ${text(project.aspect)}`,
    project?.targetDurationSec > 0 ? `${labels.target} ${numberText(project.targetDurationSec)}s` : '',
  ].filter(Boolean)
  let planned = 0
  for (const scene of storyboard?.scenes ?? []) {
    for (const shot of scene.shots ?? []) planned += Number.isFinite(shot.durationSec) ? shot.durationSec : 0
  }
  if (planned > 0) totals.push(`${labels.planned} ${numberText(planned)}s`)
  if (totals.length > 0) lines.push(totals.join(' · '), '')
  const scenes =
    text(options.sceneId) === ''
      ? (storyboard?.scenes ?? [])
      : (storyboard?.scenes ?? []).filter(scene => scene.id === options.sceneId)
  for (const scene of scenes) {
    const heading = [scene.id, text(scene.title), text(scene.purpose) === '' ? '' : `(${text(scene.purpose)})`]
      .filter(Boolean)
      .join(' ')
    lines.push(`## ${heading}`, '')
    for (const shot of scene.shots ?? []) {
      lines.push(promptBlock(shot, project, { language, headingLevel: 3 }), '')
    }
  }
  if (scenes.length === 0) lines.push(labels.empty, '')
  return `${lines.join('\n').trimEnd()}\n`
}
