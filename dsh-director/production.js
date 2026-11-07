/**
 * Pure domain layer for `@litingyes/dsh-director`.
 *
 * Everything here works on plain parsed objects: no filesystem, no Cordis, no
 * DSH imports. That keeps the rules testable with `node --test` alone, and it
 * lets the Host tools (which write through `ctx.fs`) and the read-only panel API
 * (which reads with `node:fs`) share exactly one schema and one review.
 *
 * Two validation postures, deliberately different:
 *
 *   - `normalize*` / `parse*` read a file. Structural damage throws
 *     (`schemaVersion`, a scene that is not an object, a shot without a numeric
 *     duration). Semantic gaps are kept and reported by `reviewProduction`
 *     instead, so a hand-edited file can still be inspected and fixed.
 *   - the mutation helpers (`addShot`, `updateTake`, …) validate their input
 *     strictly. They are the write path; a bad value must never reach disk.
 *
 * Updates merge one level deep: a patch that only carries `prompt.text` keeps
 * the existing negative prompt, product and params.
 *
 * @module @litingyes/dsh-director/production
 */

/** Schema version written into every production file. */
export const SCHEMA_VERSION = 1

/** Accepted aspect ratios. */
export const ASPECTS = ['16:9', '9:16', '1:1', '4:5', '4:3', '3:4', '21:9']

/** A shot's lifecycle. Advisory: the tools advance it, the review flags gaps. */
export const STATUSES = ['planned', 'prompt_ready', 'generating', 'generated', 'selected', 'dropped']

/** A scene's narrative job. */
export const PURPOSES = ['hook', 'setup', 'turn', 'payoff', 'cta']

/** Audio track kinds. */
export const TRACK_KINDS = ['vo', 'music', 'sfx']

/** Defaults for every bound the row config can override. */
export const DEFAULT_LIMITS = Object.freeze({
  maxScenes: 40,
  maxShotsPerScene: 60,
  maxTakesPerShot: 20,
  maxPromptChars: 2000,
  minShotSeconds: 1,
  maxShotSeconds: 10,
  durationTolerance: 0.15,
})

/** File names inside the production directory. */
export const FILE_NAMES = Object.freeze({
  project: 'project.json',
  storyboard: 'storyboard.json',
  audio: 'audio.json',
})

/** Stable, machine-readable failure codes. */
export const VIDEO_ERROR_CODES = Object.freeze([
  'VIDEO_NO_AGENT',
  'VIDEO_PROJECT_MISSING',
  'VIDEO_PROJECT_EXISTS',
  'VIDEO_BAD_JSON',
  'VIDEO_BAD_SCHEMA',
  'VIDEO_INVALID_INPUT',
  'VIDEO_DUPLICATE_ID',
  'VIDEO_NOT_FOUND',
  'VIDEO_LIMIT',
  'VIDEO_HAS_TAKES',
  'VIDEO_PATH_ESCAPE',
  'VIDEO_STALE',
  'VIDEO_FS',
])

/**
 * A refusal the model can act on: `code` is stable, `message` says what to do.
 */
export class VideoError extends Error {
  /**
   * @param {string} code one of `VIDEO_ERROR_CODES`.
   * @param {string} message actionable English message.
   * @param {Record<string, unknown>} [detail] extra fields for logs.
   */
  constructor(code, message, detail) {
    super(message)
    this.name = 'VideoError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

/* ------------------------------------------------------------------ helpers */

function fail(code, message, detail) {
  throw new VideoError(code, message, detail)
}

/** Current time as an ISO string; tests inject a fixed clock. */
function defaultNow() {
  return new Date().toISOString()
}

/** Round to one decimal so durations print as `38.5`, not `38.499999`. */
export function roundSeconds(value) {
  return Math.round(value * 10) / 10
}

/** Whether `value` is a plain JSON object. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * A project-relative path: forward slashes, no absolute form, no `..`, no `.`
 * and no empty segments. Returns the normalized value, or `null` when invalid.
 *
 * @param {unknown} value candidate path.
 * @returns {string | null} normalized path or null.
 */
export function normalizeRelativePath(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const normalized = trimmed.replace(/\\/gu, '/')
  if (normalized.startsWith('/')) return null
  if (/^[A-Za-z]:/u.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.length === 0) return null
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null
  }
  return normalized
}

/** Whether `value` is a valid project-relative path. */
export function isRelativeProjectPath(value) {
  return normalizeRelativePath(value) !== null
}

function readString(source, key, options = {}) {
  const raw = source[key]
  if (raw === undefined) {
    if (options.required === true) fail('VIDEO_INVALID_INPUT', `${options.label ?? key} is required`)
    return undefined
  }
  if (typeof raw !== 'string') fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be a string`)
  const value = raw.trim()
  if (options.required === true && value === '') {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must not be empty`)
  }
  if (options.max !== undefined && value.length > options.max) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be at most ${options.max} characters`)
  }
  return value
}

function readNumber(source, key, options = {}) {
  const raw = source[key]
  if (raw === undefined) {
    if (options.required === true) fail('VIDEO_INVALID_INPUT', `${options.label ?? key} is required`)
    return undefined
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be a finite number`)
  }
  if (options.min !== undefined && raw < options.min) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be >= ${options.min}`)
  }
  if (options.max !== undefined && raw > options.max) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be <= ${options.max}`)
  }
  return raw
}

function readEnum(source, key, values, options = {}) {
  const value = readString(source, key, options)
  if (value === undefined || value === '') return value
  if (!values.includes(value)) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be one of ${values.join(', ')}, got "${value}"`)
  }
  return value
}

function readStringArray(source, key, options = {}) {
  const raw = source[key]
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be an array of strings`)
  if (options.maxItems !== undefined && raw.length > options.maxItems) {
    fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must contain at most ${options.maxItems} items`)
  }
  const out = []
  for (const item of raw) {
    if (typeof item !== 'string') fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must contain only strings`)
    const value = item.trim()
    if (value === '') continue
    if (!out.includes(value)) out.push(value)
  }
  return out
}

function readPath(source, key, options = {}) {
  const raw = source[key]
  if (raw === undefined) return undefined
  // An empty string means "no file": normalized files carry it, and a patch
  // that clears a reference must not be rejected.
  if (typeof raw === 'string' && raw.trim() === '') return ''
  const normalized = normalizeRelativePath(raw)
  if (normalized === null) {
    fail(
      'VIDEO_PATH_ESCAPE',
      `${options.label ?? key} must be a project-relative path with forward slashes, no absolute path and no "..": ${JSON.stringify(raw)}`,
    )
  }
  return normalized
}

function readPathArray(source, key, options = {}) {
  const raw = source[key]
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) fail('VIDEO_INVALID_INPUT', `${options.label ?? key} must be an array of paths`)
  const out = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim() === '') continue
    const normalized = normalizeRelativePath(item)
    if (normalized === null) {
      fail('VIDEO_PATH_ESCAPE', `${options.label ?? key} must contain project-relative paths only: ${JSON.stringify(item)}`)
    }
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

function assertKnownKeys(source, allowed, label) {
  if (!isPlainObject(source)) fail('VIDEO_INVALID_INPUT', `${label} must be an object`)
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      fail('VIDEO_INVALID_INPUT', `${label} has unknown field "${key}"; allowed fields: ${allowed.join(', ')}`)
    }
  }
}

function requireObject(source, label) {
  if (!isPlainObject(source)) fail('VIDEO_INVALID_INPUT', `${label} must be an object`)
  return source
}

/**
 * Read one key as a partial object: absent stays absent, present is normalized
 * by `reader`.
 */
function partialObject(source, key, label, reader) {
  if (source[key] === undefined) return undefined
  return reader(requireObject(source[key], label))
}

/* ------------------------------------------------------------------ project */

const PROJECT_KEYS = [
  'schemaVersion',
  'title',
  'logline',
  'goal',
  'platform',
  'aspect',
  'targetDurationSec',
  'genre',
  'tone',
  'audience',
  'language',
  'products',
  'characters',
  'style',
  'createdAt',
  'updatedAt',
]

const CHARACTER_KEYS = ['id', 'name', 'look', 'wardrobe', 'voice', 'references']
const STYLE_KEYS = ['look', 'palette', 'references', 'notes']
const CHARACTER_ID = /^[A-Za-z0-9_-]{1,40}$/u

function normalizeCharacters(raw) {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) fail('VIDEO_INVALID_INPUT', 'characters must be an array')
  const out = []
  for (const entry of raw) {
    requireObject(entry, 'each character')
    assertKnownKeys(entry, CHARACTER_KEYS, 'a character')
    const id = readString(entry, 'id', { label: 'character id', required: true, max: 40 })
    if (!CHARACTER_ID.test(id)) {
      fail('VIDEO_INVALID_INPUT', `character id "${id}" must match ${String(CHARACTER_ID)}`)
    }
    out.push({
      id,
      name: readString(entry, 'name', { label: `character ${id} name`, max: 80 }) ?? '',
      look: readString(entry, 'look', { label: `character ${id} look`, max: 500 }) ?? '',
      wardrobe: readString(entry, 'wardrobe', { label: `character ${id} wardrobe`, max: 300 }) ?? '',
      voice: readString(entry, 'voice', { label: `character ${id} voice`, max: 200 }) ?? '',
      references: readPathArray(entry, 'references', { label: `character ${id} references` }) ?? [],
    })
  }
  return out
}

function normalizeStyle(raw) {
  if (raw === undefined) return { look: '', palette: [], references: [], notes: '' }
  requireObject(raw, 'style')
  assertKnownKeys(raw, STYLE_KEYS, 'style')
  return {
    look: readString(raw, 'look', { label: 'style look', max: 500 }) ?? '',
    palette: readStringArray(raw, 'palette', { label: 'style palette', maxItems: 12 }) ?? [],
    references: readPathArray(raw, 'references', { label: 'style references' }) ?? [],
    notes: readString(raw, 'notes', { label: 'style notes', max: 1000 }) ?? '',
  }
}

/**
 * Validate and normalize a parsed project object.
 *
 * @param {unknown} raw parsed JSON.
 * @returns {object} normalized project.
 */
export function normalizeProject(raw) {
  requireObject(raw, 'project.json')
  assertKnownKeys(raw, PROJECT_KEYS, 'project.json')
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail(
      'VIDEO_BAD_SCHEMA',
      `project.json schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(raw.schemaVersion)}`,
    )
  }
  const title = readString(raw, 'title', { label: 'title', max: 120 }) ?? ''
  const aspect = readEnum(raw, 'aspect', ASPECTS, { label: 'aspect' }) || '9:16'
  const target = readNumber(raw, 'targetDurationSec', { label: 'targetDurationSec', min: 0, max: 3600 })
  const characters = normalizeCharacters(raw.characters)
  const seen = new Set()
  for (const character of characters) {
    if (seen.has(character.id)) fail('VIDEO_DUPLICATE_ID', `duplicate character id "${character.id}"`)
    seen.add(character.id)
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    title: title === '' ? '未命名 AI 短片' : title,
    logline: readString(raw, 'logline', { label: 'logline', max: 500 }) ?? '',
    goal: readString(raw, 'goal', { label: 'goal', max: 500 }) ?? '',
    platform: readString(raw, 'platform', { label: 'platform', max: 60 }) ?? '',
    aspect,
    targetDurationSec: target === undefined ? 0 : roundSeconds(target),
    genre: readString(raw, 'genre', { label: 'genre', max: 60 }) ?? '',
    tone: readString(raw, 'tone', { label: 'tone', max: 120 }) ?? '',
    audience: readString(raw, 'audience', { label: 'audience', max: 200 }) ?? '',
    language: readString(raw, 'language', { label: 'language', max: 20 }) ?? 'zh',
    products: readStringArray(raw, 'products', { label: 'products', maxItems: 20 }) ?? [],
    characters,
    style: normalizeStyle(raw.style),
    createdAt: readString(raw, 'createdAt', { label: 'createdAt', max: 40 }) ?? '',
    updatedAt: readString(raw, 'updatedAt', { label: 'updatedAt', max: 40 }) ?? '',
  }
}

/** The fields `init` / `update` accept, with their JSON wire names. */
const PROJECT_INPUT_KEYS = [
  'title',
  'logline',
  'goal',
  'platform',
  'aspect',
  'genre',
  'tone',
  'audience',
  'language',
  'target_duration_sec',
  'products',
  'characters',
  'style',
]

/**
 * Apply a partial project input to a project object.
 *
 * @param {object} project current project.
 * @param {Record<string, unknown>} input fields in their wire form.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated project.
 */
export function applyProjectFields(project, input, options = {}) {
  const now = options.now ?? defaultNow
  requireObject(input, 'project fields')
  for (const key of Object.keys(input)) {
    if (!PROJECT_INPUT_KEYS.includes(key) && key !== 'action') {
      fail(
        'VIDEO_INVALID_INPUT',
        `project has unknown field "${key}"; allowed fields: ${PROJECT_INPUT_KEYS.join(', ')}`,
      )
    }
  }
  const next = { ...project }
  const title = readString(input, 'title', { label: 'title', max: 120 })
  if (title !== undefined) next.title = title === '' ? '未命名 AI 短片' : title
  const stringLimits = {
    logline: 500,
    goal: 500,
    platform: 60,
    genre: 60,
    tone: 120,
    audience: 200,
    language: 20,
  }
  for (const [key, max] of Object.entries(stringLimits)) {
    const value = readString(input, key, { label: key, max })
    if (value !== undefined) next[key] = value
  }
  const aspect = readEnum(input, 'aspect', ASPECTS, { label: 'aspect' })
  if (aspect !== undefined) next.aspect = aspect
  const target = readNumber(input, 'target_duration_sec', { label: 'target_duration_sec', min: 0, max: 3600 })
  if (target !== undefined) next.targetDurationSec = roundSeconds(target)
  const products = readStringArray(input, 'products', { label: 'products', maxItems: 20 })
  if (products !== undefined) next.products = products
  if (input.characters !== undefined) next.characters = normalizeCharacters(input.characters)
  if (input.style !== undefined) next.style = normalizeStyle(input.style)
  next.updatedAt = now()
  return normalizeProject(next)
}

/**
 * Build a new project from `init` input.
 *
 * @param {Record<string, unknown>} input wire input.
 * @param {{ now?: () => string, aspect?: string }} [options] clock and default aspect.
 * @returns {object} normalized project.
 */
export function createProject(input = {}, options = {}) {
  const now = options.now ?? defaultNow
  const base = {
    schemaVersion: SCHEMA_VERSION,
    title: '未命名 AI 短片',
    logline: '',
    goal: '',
    platform: '',
    aspect: options.aspect ?? '9:16',
    targetDurationSec: 0,
    genre: '',
    tone: '',
    audience: '',
    language: 'zh',
    products: [],
    characters: [],
    style: { look: '', palette: [], references: [], notes: '' },
    createdAt: now(),
    updatedAt: now(),
  }
  const seeded = applyProjectFields(base, input, { now })
  return { ...seeded, createdAt: base.createdAt }
}

function parseJson(text, label) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    fail('VIDEO_BAD_JSON', `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parsed
}

/**
 * Parse a project file's text.
 *
 * @param {string} text file content.
 * @returns {object} normalized project.
 */
export function parseProjectText(text) {
  return normalizeProject(parseJson(text, FILE_NAMES.project))
}

/* --------------------------------------------------------------- storyboard */

const SCENE_KEYS = ['title', 'purpose', 'summary', 'location', 'time_of_day']
const SHOT_INPUT_KEYS = [
  'duration_sec',
  'shot_size',
  'angle',
  'movement',
  'subject',
  'action',
  'dialogue',
  'on_screen_text',
  'audio',
  'prompt',
  'continuity',
  'status',
]
const SHOT_KEYS = [
  'id',
  'durationSec',
  'shotSize',
  'angle',
  'movement',
  'subject',
  'action',
  'dialogue',
  'onScreenText',
  'audio',
  'prompt',
  'continuity',
  'status',
  'takes',
]
const TAKE_INPUT_KEYS = ['file', 'rating', 'notes']
const TAKE_KEYS = ['id', 'file', 'createdAt', 'rating', 'notes', 'selected']
const SHOT_AUDIO_KEYS = ['vo', 'sfx', 'music']
const PROMPT_KEYS = ['text', 'negative', 'product', 'params']
const PARAM_KEYS = ['duration', 'aspect', 'firstFrame', 'lastFrame', 'references', 'seed', 'extra']
const CONTINUITY_KEYS = ['characters', 'props', 'notes']

const EMPTY_PARAMS = Object.freeze({
  duration: '',
  aspect: '',
  firstFrame: '',
  lastFrame: '',
  references: [],
  seed: '',
  extra: '',
})

function readParamsPartial(raw) {
  requireObject(raw, 'shot prompt params')
  assertKnownKeys(raw, PARAM_KEYS, 'shot prompt params')
  const out = {}
  if (raw.duration !== undefined) out.duration = readString(raw, 'duration', { label: 'prompt params duration', max: 40 })
  if (raw.aspect !== undefined) out.aspect = readString(raw, 'aspect', { label: 'prompt params aspect', max: 20 })
  if (raw.firstFrame !== undefined) out.firstFrame = readPath(raw, 'firstFrame', { label: 'prompt params firstFrame' })
  if (raw.lastFrame !== undefined) out.lastFrame = readPath(raw, 'lastFrame', { label: 'prompt params lastFrame' })
  if (raw.references !== undefined) {
    out.references = readPathArray(raw, 'references', { label: 'prompt params references' })
  }
  if (raw.seed !== undefined) out.seed = readString(raw, 'seed', { label: 'prompt params seed', max: 40 })
  if (raw.extra !== undefined) out.extra = readString(raw, 'extra', { label: 'prompt params extra', max: 500 })
  return out
}

function readPromptPartial(raw) {
  requireObject(raw, 'shot prompt')
  assertKnownKeys(raw, PROMPT_KEYS, 'shot prompt')
  const out = {}
  if (raw.text !== undefined) out.text = readString(raw, 'text', { label: 'prompt text', max: 20000 })
  if (raw.negative !== undefined) out.negative = readString(raw, 'negative', { label: 'prompt negative', max: 20000 })
  if (raw.product !== undefined) out.product = readString(raw, 'product', { label: 'prompt product', max: 80 })
  if (raw.params !== undefined) out.params = readParamsPartial(raw.params)
  return out
}

function fullParams(partial) {
  return partial === undefined ? { ...EMPTY_PARAMS } : { ...EMPTY_PARAMS, ...partial }
}

function fullPrompt(partial) {
  return {
    text: partial?.text ?? '',
    negative: partial?.negative ?? '',
    product: partial?.product ?? '',
    params: fullParams(partial?.params),
  }
}

function readShotAudioPartial(raw) {
  requireObject(raw, 'shot audio')
  assertKnownKeys(raw, SHOT_AUDIO_KEYS, 'shot audio')
  const out = {}
  if (raw.vo !== undefined) out.vo = readString(raw, 'vo', { label: 'shot audio vo', max: 2000 })
  if (raw.sfx !== undefined) out.sfx = readStringArray(raw, 'sfx', { label: 'shot audio sfx', maxItems: 12 })
  if (raw.music !== undefined) out.music = readString(raw, 'music', { label: 'shot audio music', max: 300 })
  return out
}

function fullShotAudio(partial) {
  return { vo: partial?.vo ?? '', sfx: partial?.sfx ?? [], music: partial?.music ?? '' }
}

function readContinuityPartial(raw) {
  requireObject(raw, 'shot continuity')
  assertKnownKeys(raw, CONTINUITY_KEYS, 'shot continuity')
  const out = {}
  if (raw.characters !== undefined) {
    out.characters = readStringArray(raw, 'characters', { label: 'continuity characters', maxItems: 20 })
  }
  if (raw.props !== undefined) out.props = readStringArray(raw, 'props', { label: 'continuity props', maxItems: 20 })
  if (raw.notes !== undefined) out.notes = readString(raw, 'notes', { label: 'continuity notes', max: 500 })
  return out
}

function fullContinuity(partial) {
  return { characters: partial?.characters ?? [], props: partial?.props ?? [], notes: partial?.notes ?? '' }
}

function normalizeTake(raw, label) {
  requireObject(raw, label)
  assertKnownKeys(raw, TAKE_KEYS, label)
  const id = readString(raw, 'id', { label: `${label} id`, required: true, max: 20 })
  const rating = readNumber(raw, 'rating', { label: `${label} rating`, min: 0, max: 5 })
  return {
    id,
    file: readPath(raw, 'file', { label: `${label} file` }) ?? '',
    createdAt: readString(raw, 'createdAt', { label: `${label} createdAt`, max: 40 }) ?? '',
    rating: rating === undefined ? 0 : Math.round(rating),
    notes: readString(raw, 'notes', { label: `${label} notes`, max: 1000 }) ?? '',
    selected: raw.selected === true,
  }
}

function normalizeShot(raw, label) {
  requireObject(raw, label)
  assertKnownKeys(raw, SHOT_KEYS, `a shot in ${label}`)
  const id = readString(raw, 'id', { label: `shot id in ${label}`, required: true, max: 24 })
  const duration = readNumber(raw, 'durationSec', { label: `shot ${id} durationSec`, required: true, min: 0 })
  const takesRaw = raw.takes === undefined ? [] : raw.takes
  if (!Array.isArray(takesRaw)) fail('VIDEO_INVALID_INPUT', `shot ${id} takes must be an array`)
  const takes = takesRaw.map((take, index) => normalizeTake(take, `shot ${id} take ${index + 1}`))
  return {
    id,
    durationSec: roundSeconds(duration),
    shotSize: readString(raw, 'shotSize', { label: `shot ${id} shotSize`, max: 40 }) ?? '',
    angle: readString(raw, 'angle', { label: `shot ${id} angle`, max: 40 }) ?? '',
    movement: readString(raw, 'movement', { label: `shot ${id} movement`, max: 40 }) ?? '',
    subject: readString(raw, 'subject', { label: `shot ${id} subject`, max: 200 }) ?? '',
    action: readString(raw, 'action', { label: `shot ${id} action`, max: 1000 }) ?? '',
    dialogue: readString(raw, 'dialogue', { label: `shot ${id} dialogue`, max: 2000 }) ?? '',
    onScreenText: readString(raw, 'onScreenText', { label: `shot ${id} onScreenText`, max: 200 }) ?? '',
    audio: fullShotAudio(raw.audio === undefined ? undefined : readShotAudioPartial(raw.audio)),
    prompt: fullPrompt(raw.prompt === undefined ? undefined : readPromptPartial(raw.prompt)),
    continuity: fullContinuity(raw.continuity === undefined ? undefined : readContinuityPartial(raw.continuity)),
    status: readString(raw, 'status', { label: `shot ${id} status`, max: 20 }) || 'planned',
    takes,
  }
}

function normalizeScene(raw, index) {
  const label = `scene ${index + 1}`
  requireObject(raw, label)
  assertKnownKeys(raw, ['id', 'title', 'purpose', 'summary', 'location', 'timeOfDay', 'shots'], `a ${label}`)
  const id = readString(raw, 'id', { label: `${label} id`, required: true, max: 20 })
  const shotsRaw = raw.shots === undefined ? [] : raw.shots
  if (!Array.isArray(shotsRaw)) fail('VIDEO_INVALID_INPUT', `scene ${id} shots must be an array`)
  return {
    id,
    title: readString(raw, 'title', { label: `scene ${id} title`, max: 80 }) ?? '',
    purpose: readString(raw, 'purpose', { label: `scene ${id} purpose`, max: 20 }) ?? '',
    summary: readString(raw, 'summary', { label: `scene ${id} summary`, max: 500 }) ?? '',
    location: readString(raw, 'location', { label: `scene ${id} location`, max: 120 }) ?? '',
    timeOfDay: readString(raw, 'timeOfDay', { label: `scene ${id} timeOfDay`, max: 60 }) ?? '',
    shots: shotsRaw.map((shot, shotIndex) => normalizeShot(shot, `scene ${id} shot ${shotIndex + 1}`)),
  }
}

/** An empty storyboard. */
export function createEmptyStoryboard(now = defaultNow) {
  return { schemaVersion: SCHEMA_VERSION, scenes: [], updatedAt: now() }
}

/**
 * Validate a parsed storyboard object.
 *
 * @param {unknown} raw parsed JSON.
 * @returns {object} normalized storyboard.
 */
export function normalizeStoryboard(raw) {
  requireObject(raw, 'storyboard.json')
  assertKnownKeys(raw, ['schemaVersion', 'scenes', 'updatedAt'], 'storyboard.json')
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail(
      'VIDEO_BAD_SCHEMA',
      `storyboard.json schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(raw.schemaVersion)}`,
    )
  }
  if (!Array.isArray(raw.scenes)) fail('VIDEO_INVALID_INPUT', 'storyboard.json scenes must be an array')
  return {
    schemaVersion: SCHEMA_VERSION,
    scenes: raw.scenes.map(normalizeScene),
    updatedAt: readString(raw, 'updatedAt', { label: 'storyboard updatedAt', max: 40 }) ?? '',
  }
}

/**
 * Parse a storyboard file's text.
 *
 * @param {string} text file content.
 * @returns {object} normalized storyboard.
 */
export function parseStoryboardText(text) {
  return normalizeStoryboard(parseJson(text, FILE_NAMES.storyboard))
}

/** Every shot with its scene attached, in storyboard order. */
export function listShots(storyboard) {
  const out = []
  if (storyboard === null || storyboard === undefined) return out
  for (const scene of storyboard.scenes ?? []) {
    for (const shot of scene.shots ?? []) out.push({ scene, shot })
  }
  return out
}

/** Find one scene, or fail. */
function findScene(storyboard, sceneId) {
  const scene = (storyboard.scenes ?? []).find(entry => entry.id === sceneId)
  if (scene === undefined) {
    const known = (storyboard.scenes ?? []).map(entry => entry.id).join(', ') || '(none)'
    fail('VIDEO_NOT_FOUND', `no scene "${sceneId}"; known scenes: ${known}`)
  }
  return scene
}

/** Find one shot (and its scene), or fail. */
export function findShot(storyboard, shotId) {
  for (const scene of storyboard.scenes ?? []) {
    const shot = (scene.shots ?? []).find(entry => entry.id === shotId)
    if (shot !== undefined) return { scene, shot }
  }
  const known = listShots(storyboard).map(entry => entry.shot.id).join(', ') || '(none)'
  fail('VIDEO_NOT_FOUND', `no shot "${shotId}"; known shots: ${known}`)
}

function nextSceneId(storyboard) {
  let max = 0
  for (const scene of storyboard.scenes ?? []) {
    const match = /^S(\d+)$/u.exec(scene.id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `S${max + 1}`
}

function nextShotId(scene) {
  let max = 0
  for (const shot of scene.shots ?? []) {
    const match = new RegExp(`^${scene.id}-(\\d+)$`, 'u').exec(shot.id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `${scene.id}-${String(max + 1).padStart(2, '0')}`
}

function nextTakeId(shot) {
  let max = 0
  for (const take of shot.takes ?? []) {
    const match = /^t(\d+)$/u.exec(take.id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `t${max + 1}`
}

function nextTrackId(audio) {
  let max = 0
  for (const track of audio.tracks ?? []) {
    const match = /^A(\d+)$/u.exec(track.id)
    if (match !== null) max = Math.max(max, Number(match[1]))
  }
  return `A${max + 1}`
}

function stamp(storyboard, now) {
  return { ...storyboard, updatedAt: now() }
}

/**
 * Add a scene. Input is the wire form (`time_of_day`).
 *
 * @param {object} storyboard current storyboard.
 * @param {Record<string, unknown>} input scene fields.
 * @param {{ limits?: object, now?: () => string }} [options] bounds and clock.
 * @returns {object} the updated storyboard.
 */
export function addScene(storyboard, input, options = {}) {
  const limits = options.limits ?? DEFAULT_LIMITS
  const now = options.now ?? defaultNow
  requireObject(input, 'scene')
  assertKnownKeys(input, SCENE_KEYS, 'scene')
  if (storyboard.scenes.length >= limits.maxScenes) {
    fail('VIDEO_LIMIT', `this production already has ${limits.maxScenes} scenes (maxScenes)`)
  }
  const scene = {
    id: nextSceneId(storyboard),
    title: readString(input, 'title', { label: 'scene title', max: 80 }) ?? '',
    purpose: readEnum(input, 'purpose', PURPOSES, { label: 'scene purpose' }) ?? '',
    summary: readString(input, 'summary', { label: 'scene summary', max: 500 }) ?? '',
    location: readString(input, 'location', { label: 'scene location', max: 120 }) ?? '',
    timeOfDay: readString(input, 'time_of_day', { label: 'scene time_of_day', max: 60 }) ?? '',
    shots: [],
  }
  return stamp({ ...storyboard, scenes: [...storyboard.scenes, scene] }, now)
}

/**
 * Update one scene. Only provided fields are merged.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} sceneId target scene id.
 * @param {Record<string, unknown>} patch wire fields.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated storyboard.
 */
export function updateScene(storyboard, sceneId, patch, options = {}) {
  const now = options.now ?? defaultNow
  const scene = findScene(storyboard, sceneId)
  requireObject(patch, 'scene patch')
  assertKnownKeys(patch, SCENE_KEYS, 'scene patch')
  const next = { ...scene }
  const title = readString(patch, 'title', { label: 'scene title', max: 80 })
  if (title !== undefined) next.title = title
  const purpose = readEnum(patch, 'purpose', PURPOSES, { label: 'scene purpose' })
  if (purpose !== undefined) next.purpose = purpose
  for (const [wire, key, max] of [
    ['summary', 'summary', 500],
    ['location', 'location', 120],
    ['time_of_day', 'timeOfDay', 60],
  ]) {
    const value = readString(patch, wire, { label: `scene ${wire}`, max })
    if (value !== undefined) next[key] = value
  }
  return stamp(
    { ...storyboard, scenes: storyboard.scenes.map(entry => (entry.id === sceneId ? next : entry)) },
    now,
  )
}

/**
 * Remove a scene. A scene that still holds shots needs `force`.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} sceneId target scene id.
 * @param {{ force?: boolean, now?: () => string }} [options] confirm and clock.
 * @returns {object} the updated storyboard.
 */
export function removeScene(storyboard, sceneId, options = {}) {
  const now = options.now ?? defaultNow
  const scene = findScene(storyboard, sceneId)
  if (scene.shots.length > 0 && options.force !== true) {
    fail('VIDEO_HAS_TAKES', `scene ${sceneId} still holds ${scene.shots.length} shot(s); pass force: true to remove it`)
  }
  return stamp({ ...storyboard, scenes: storyboard.scenes.filter(entry => entry.id !== sceneId) }, now)
}

/**
 * Read a shot patch. `requireDuration` is false for updates: a patch that only
 * touches the prompt must not re-validate an old duration against new limits.
 */
function readShotFields(input, limits, requireDuration) {
  requireObject(input, 'shot')
  assertKnownKeys(input, SHOT_INPUT_KEYS, 'shot')
  const out = {}
  if (requireDuration || input.duration_sec !== undefined) {
    out.durationSec = roundSeconds(
      readNumber(input, 'duration_sec', {
        label: 'shot duration_sec',
        required: true,
        min: limits.minShotSeconds,
        max: limits.maxShotSeconds,
      }),
    )
  }
  if (input.shot_size !== undefined) out.shotSize = readString(input, 'shot_size', { label: 'shot_size', max: 40 })
  if (input.angle !== undefined) out.angle = readString(input, 'angle', { label: 'angle', max: 40 })
  if (input.movement !== undefined) out.movement = readString(input, 'movement', { label: 'movement', max: 40 })
  if (input.subject !== undefined) out.subject = readString(input, 'subject', { label: 'subject', max: 200 })
  if (input.action !== undefined) out.action = readString(input, 'action', { label: 'action', max: 1000 })
  if (input.dialogue !== undefined) out.dialogue = readString(input, 'dialogue', { label: 'dialogue', max: 2000 })
  if (input.on_screen_text !== undefined) {
    out.onScreenText = readString(input, 'on_screen_text', { label: 'on_screen_text', max: 200 })
  }
  if (input.audio !== undefined) out.audio = readShotAudioPartial(input.audio)
  if (input.prompt !== undefined) out.prompt = readPromptPartial(input.prompt)
  if (input.continuity !== undefined) out.continuity = readContinuityPartial(input.continuity)
  if (input.status !== undefined) out.status = readEnum(input, 'status', STATUSES, { label: 'shot status' })
  return out
}

/**
 * Add a shot to a scene.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} sceneId target scene id.
 * @param {Record<string, unknown>} input shot fields.
 * @param {{ limits?: object, now?: () => string }} [options] bounds and clock.
 * @returns {object} the updated storyboard.
 */
export function addShot(storyboard, sceneId, input, options = {}) {
  const limits = options.limits ?? DEFAULT_LIMITS
  const now = options.now ?? defaultNow
  const scene = findScene(storyboard, sceneId)
  if (scene.shots.length >= limits.maxShotsPerScene) {
    fail('VIDEO_LIMIT', `scene ${sceneId} already has ${limits.maxShotsPerScene} shots (maxShotsPerScene)`)
  }
  const fields = readShotFields(input, limits, true)
  const shot = {
    id: nextShotId(scene),
    durationSec: fields.durationSec,
    shotSize: fields.shotSize ?? '',
    angle: fields.angle ?? '',
    movement: fields.movement ?? '',
    subject: fields.subject ?? '',
    action: fields.action ?? '',
    dialogue: fields.dialogue ?? '',
    onScreenText: fields.onScreenText ?? '',
    audio: fullShotAudio(fields.audio),
    prompt: fullPrompt(fields.prompt),
    continuity: fullContinuity(fields.continuity),
    status: fields.status ?? 'planned',
    takes: [],
  }
  return stamp(
    {
      ...storyboard,
      scenes: storyboard.scenes.map(entry =>
        entry.id === sceneId ? { ...entry, shots: [...entry.shots, shot] } : entry,
      ),
    },
    now,
  )
}

function mergeShot(current, fields) {
  const next = { ...current }
  if (fields.durationSec !== undefined) next.durationSec = fields.durationSec
  for (const key of ['shotSize', 'angle', 'movement', 'subject', 'action', 'dialogue', 'onScreenText', 'status']) {
    if (fields[key] !== undefined) next[key] = fields[key]
  }
  if (fields.audio !== undefined) next.audio = { ...current.audio, ...fields.audio }
  if (fields.continuity !== undefined) next.continuity = { ...current.continuity, ...fields.continuity }
  if (fields.prompt !== undefined) {
    next.prompt = {
      ...current.prompt,
      ...fields.prompt,
      params:
        fields.prompt.params === undefined
          ? current.prompt.params
          : { ...current.prompt.params, ...fields.prompt.params },
    }
  }
  return next
}

/**
 * Update one shot. Nested objects merge one level deep; prompt params merge too.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId target shot id.
 * @param {Record<string, unknown>} patch shot fields.
 * @param {{ limits?: object, now?: () => string }} [options] bounds and clock.
 * @returns {object} the updated storyboard.
 */
export function updateShot(storyboard, shotId, patch, options = {}) {
  const limits = options.limits ?? DEFAULT_LIMITS
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  const fields = readShotFields(patch, limits, false)
  const next = mergeShot(shot, fields)
  return stamp(
    {
      ...storyboard,
      scenes: storyboard.scenes.map(entry =>
        entry.id === scene.id
          ? { ...entry, shots: entry.shots.map(item => (item.id === shotId ? next : item)) }
          : entry,
      ),
    },
    now,
  )
}

/**
 * Reorder a shot inside its own scene.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId target shot id.
 * @param {number} position 0-based index inside the scene.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated storyboard.
 */
export function reorderShot(storyboard, shotId, position, options = {}) {
  const now = options.now ?? defaultNow
  const { scene } = findShot(storyboard, shotId)
  if (!Number.isInteger(position) || position < 0 || position >= scene.shots.length) {
    fail('VIDEO_INVALID_INPUT', `position must be an integer from 0 to ${scene.shots.length - 1}`)
  }
  const current = scene.shots.findIndex(entry => entry.id === shotId)
  if (current === position) return storyboard
  const shots = [...scene.shots]
  const [moved] = shots.splice(current, 1)
  shots.splice(position, 0, moved)
  return stamp(
    {
      ...storyboard,
      scenes: storyboard.scenes.map(entry => (entry.id === scene.id ? { ...entry, shots } : entry)),
    },
    now,
  )
}

/**
 * Remove a shot. A shot that still holds takes needs `force`.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId target shot id.
 * @param {{ force?: boolean, now?: () => string }} [options] confirm and clock.
 * @returns {object} the updated storyboard.
 */
export function removeShot(storyboard, shotId, options = {}) {
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  if (shot.takes.length > 0 && options.force !== true) {
    fail('VIDEO_HAS_TAKES', `shot ${shotId} still holds ${shot.takes.length} take(s); pass force: true to remove it`)
  }
  return stamp(
    {
      ...storyboard,
      scenes: storyboard.scenes.map(entry =>
        entry.id === scene.id
          ? { ...entry, shots: entry.shots.filter(item => item.id !== shotId) }
          : entry,
      ),
    },
    now,
  )
}

/* -------------------------------------------------------------------- takes */

function readTakeFields(input) {
  requireObject(input, 'take')
  assertKnownKeys(input, TAKE_INPUT_KEYS, 'take')
  const out = {}
  if (input.file !== undefined) out.file = readPath(input, 'file', { label: 'take file' })
  if (input.rating !== undefined) {
    const rating = readNumber(input, 'rating', { label: 'take rating', min: 1, max: 5 })
    if (!Number.isInteger(rating)) fail('VIDEO_INVALID_INPUT', 'take rating must be an integer from 1 to 5')
    out.rating = rating
  }
  if (input.notes !== undefined) out.notes = readString(input, 'notes', { label: 'take notes', max: 1000 })
  return out
}

function withShot(storyboard, sceneId, nextShot) {
  return {
    ...storyboard,
    scenes: storyboard.scenes.map(entry =>
      entry.id === sceneId
        ? { ...entry, shots: entry.shots.map(item => (item.id === nextShot.id ? nextShot : item)) }
        : entry,
    ),
  }
}

/**
 * Record a take for a shot. The first take moves a planned shot to `generated`.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId target shot id.
 * @param {Record<string, unknown>} input take fields.
 * @param {{ limits?: object, now?: () => string }} [options] bounds and clock.
 * @returns {object} the updated storyboard.
 */
export function addTake(storyboard, shotId, input, options = {}) {
  const limits = options.limits ?? DEFAULT_LIMITS
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  if (shot.takes.length >= limits.maxTakesPerShot) {
    fail('VIDEO_LIMIT', `shot ${shotId} already has ${limits.maxTakesPerShot} takes (maxTakesPerShot)`)
  }
  const fields = readTakeFields(input)
  const take = {
    id: nextTakeId(shot),
    file: fields.file ?? '',
    createdAt: now(),
    rating: fields.rating ?? 0,
    notes: fields.notes ?? '',
    selected: false,
  }
  const status =
    shot.status === 'planned' || shot.status === 'prompt_ready' || shot.status === 'generating'
      ? 'generated'
      : shot.status
  return stamp(withShot(storyboard, scene.id, { ...shot, status, takes: [...shot.takes, take] }), now)
}

/**
 * Select one take of a shot, clearing the others and moving the shot to
 * `selected`.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId target shot id.
 * @param {string} takeId chosen take.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated storyboard.
 */
export function selectTake(storyboard, shotId, takeId, options = {}) {
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  if (!shot.takes.some(take => take.id === takeId)) {
    const known = shot.takes.map(take => take.id).join(', ') || '(none)'
    fail('VIDEO_NOT_FOUND', `shot ${shotId} has no take "${takeId}"; known takes: ${known}`)
  }
  const next = {
    ...shot,
    status: 'selected',
    takes: shot.takes.map(take => ({ ...take, selected: take.id === takeId })),
  }
  return stamp(withShot(storyboard, scene.id, next), now)
}

/**
 * Update a take's file, rating or notes.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId parent shot id.
 * @param {string} takeId target take.
 * @param {Record<string, unknown>} patch take fields.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated storyboard.
 */
export function updateTake(storyboard, shotId, takeId, patch, options = {}) {
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  const fields = readTakeFields(patch)
  const existing = shot.takes.find(take => take.id === takeId)
  if (existing === undefined) {
    const known = shot.takes.map(take => take.id).join(', ') || '(none)'
    fail('VIDEO_NOT_FOUND', `shot ${shotId} has no take "${takeId}"; known takes: ${known}`)
  }
  const next = { ...shot, takes: shot.takes.map(take => (take.id === takeId ? { ...take, ...fields } : take)) }
  return stamp(withShot(storyboard, scene.id, next), now)
}

/**
 * Remove a take. Removing the selected take drops the shot back to `generated`
 * when it has no other selected take.
 *
 * @param {object} storyboard current storyboard.
 * @param {string} shotId parent shot id.
 * @param {string} takeId target take.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated storyboard.
 */
export function removeTake(storyboard, shotId, takeId, options = {}) {
  const now = options.now ?? defaultNow
  const { scene, shot } = findShot(storyboard, shotId)
  if (!shot.takes.some(take => take.id === takeId)) {
    fail('VIDEO_NOT_FOUND', `shot ${shotId} has no take "${takeId}"`)
  }
  const takes = shot.takes.filter(take => take.id !== takeId)
  const stillSelected = takes.some(take => take.selected)
  const status = shot.status === 'selected' && !stillSelected ? 'generated' : shot.status
  return stamp(withShot(storyboard, scene.id, { ...shot, status, takes }), now)
}

/* -------------------------------------------------------------------- audio */

const TRACK_INPUT_KEYS = [
  'kind',
  'scene_id',
  'shot_ids',
  'text',
  'file',
  'start_sec',
  'duration_sec',
  'notes',
]
const TRACK_KEYS = ['id', 'kind', 'sceneId', 'shotIds', 'text', 'file', 'startSec', 'durationSec', 'notes']

function normalizeTrack(raw, label) {
  requireObject(raw, label)
  assertKnownKeys(raw, TRACK_KEYS, label)
  return {
    id: readString(raw, 'id', { label: `${label} id`, required: true, max: 20 }),
    kind: readString(raw, 'kind', { label: `${label} kind`, required: true, max: 10 }),
    sceneId: readString(raw, 'sceneId', { label: `${label} sceneId`, max: 20 }) ?? '',
    shotIds: readStringArray(raw, 'shotIds', { label: `${label} shotIds`, maxItems: 200 }) ?? [],
    text: readString(raw, 'text', { label: `${label} text`, max: 4000 }) ?? '',
    file: readPath(raw, 'file', { label: `${label} file` }) ?? '',
    startSec: Number.isFinite(raw.startSec) ? roundSeconds(raw.startSec) : 0,
    durationSec: Number.isFinite(raw.durationSec) ? roundSeconds(raw.durationSec) : 0,
    notes: readString(raw, 'notes', { label: `${label} notes`, max: 1000 }) ?? '',
  }
}

/** An empty audio plan. */
export function createEmptyAudio(now = defaultNow) {
  return { schemaVersion: SCHEMA_VERSION, tracks: [], updatedAt: now() }
}

/**
 * Validate a parsed audio plan.
 *
 * @param {unknown} raw parsed JSON.
 * @returns {object} normalized audio plan.
 */
export function normalizeAudio(raw) {
  requireObject(raw, 'audio.json')
  assertKnownKeys(raw, ['schemaVersion', 'tracks', 'updatedAt'], 'audio.json')
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail(
      'VIDEO_BAD_SCHEMA',
      `audio.json schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(raw.schemaVersion)}`,
    )
  }
  if (!Array.isArray(raw.tracks)) fail('VIDEO_INVALID_INPUT', 'audio.json tracks must be an array')
  return {
    schemaVersion: SCHEMA_VERSION,
    tracks: raw.tracks.map((track, index) => normalizeTrack(track, `track ${index + 1}`)),
    updatedAt: readString(raw, 'updatedAt', { label: 'audio updatedAt', max: 40 }) ?? '',
  }
}

/**
 * Parse an audio plan's text.
 *
 * @param {string} text file content.
 * @returns {object} normalized audio plan.
 */
export function parseAudioText(text) {
  return normalizeAudio(parseJson(text, FILE_NAMES.audio))
}

function readTrackFields(input) {
  requireObject(input, 'track')
  assertKnownKeys(input, TRACK_INPUT_KEYS, 'track')
  const out = {}
  if (input.kind !== undefined) out.kind = readEnum(input, 'kind', TRACK_KINDS, { label: 'track kind' })
  if (input.scene_id !== undefined) out.sceneId = readString(input, 'scene_id', { label: 'track scene_id', max: 20 })
  if (input.shot_ids !== undefined) {
    out.shotIds = readStringArray(input, 'shot_ids', { label: 'track shot_ids', maxItems: 200 })
  }
  if (input.text !== undefined) out.text = readString(input, 'text', { label: 'track text', max: 4000 })
  if (input.file !== undefined) out.file = readPath(input, 'file', { label: 'track file' })
  if (input.start_sec !== undefined) out.startSec = readNumber(input, 'start_sec', { label: 'track start_sec', min: 0 })
  if (input.duration_sec !== undefined) {
    out.durationSec = readNumber(input, 'duration_sec', { label: 'track duration_sec', min: 0 })
  }
  if (input.notes !== undefined) out.notes = readString(input, 'notes', { label: 'track notes', max: 1000 })
  return out
}

function validateTrackTargets(track, storyboard) {
  const sceneId = track.sceneId ?? ''
  const shotIds = track.shotIds ?? []
  if (track.kind === 'vo' || track.kind === 'sfx') {
    if (sceneId === '' && shotIds.length === 0) {
      fail('VIDEO_INVALID_INPUT', `a ${track.kind} track needs scene_id or shot_ids`)
    }
  }
  if (storyboard === undefined || storyboard === null) return
  const scenes = new Set((storyboard.scenes ?? []).map(scene => scene.id))
  const shots = new Set(listShots(storyboard).map(entry => entry.shot.id))
  if (sceneId !== '' && !scenes.has(sceneId)) {
    fail('VIDEO_NOT_FOUND', `audio track targets unknown scene "${sceneId}"`)
  }
  for (const shotId of shotIds) {
    if (!shots.has(shotId)) fail('VIDEO_NOT_FOUND', `audio track targets unknown shot "${shotId}"`)
  }
}

const EMPTY_TRACK = {
  kind: '',
  sceneId: '',
  shotIds: [],
  text: '',
  file: '',
  startSec: 0,
  durationSec: 0,
  notes: '',
}

/**
 * Add an audio track.
 *
 * @param {object} audio current audio plan.
 * @param {Record<string, unknown>} input track fields.
 * @param {{ storyboard?: object, now?: () => string }} [options] target check and clock.
 * @returns {object} the updated audio plan.
 */
export function addTrack(audio, input, options = {}) {
  const now = options.now ?? defaultNow
  const fields = readTrackFields(input)
  if (fields.kind === undefined || fields.kind === '') {
    fail('VIDEO_INVALID_INPUT', 'track kind is required (vo | music | sfx)')
  }
  const track = { ...EMPTY_TRACK, ...fields }
  validateTrackTargets(track, options.storyboard)
  return {
    ...audio,
    tracks: [...audio.tracks, { ...track, id: nextTrackId(audio) }],
    updatedAt: now(),
  }
}

/**
 * Update an audio track. Only provided fields are merged.
 *
 * @param {object} audio current audio plan.
 * @param {string} trackId target track.
 * @param {Record<string, unknown>} patch track fields.
 * @param {{ storyboard?: object, now?: () => string }} [options] target check and clock.
 * @returns {object} the updated audio plan.
 */
export function updateTrack(audio, trackId, patch, options = {}) {
  const now = options.now ?? defaultNow
  const existing = audio.tracks.find(track => track.id === trackId)
  if (existing === undefined) {
    const known = audio.tracks.map(track => track.id).join(', ') || '(none)'
    fail('VIDEO_NOT_FOUND', `no audio track "${trackId}"; known tracks: ${known}`)
  }
  const merged = { ...existing, ...readTrackFields(patch) }
  validateTrackTargets(merged, options.storyboard)
  return {
    ...audio,
    tracks: audio.tracks.map(track => (track.id === trackId ? merged : track)),
    updatedAt: now(),
  }
}

/**
 * Remove an audio track.
 *
 * @param {object} audio current audio plan.
 * @param {string} trackId target track.
 * @param {{ now?: () => string }} [options] clock.
 * @returns {object} the updated audio plan.
 */
export function removeTrack(audio, trackId, options = {}) {
  const now = options.now ?? defaultNow
  if (!audio.tracks.some(track => track.id === trackId)) {
    fail('VIDEO_NOT_FOUND', `no audio track "${trackId}"`)
  }
  return { ...audio, tracks: audio.tracks.filter(track => track.id !== trackId), updatedAt: now() }
}

/* ------------------------------------------------------------------ summary */

/**
 * Production totals shared by the tools, the review and the panel.
 *
 * @param {object | null} project project or null.
 * @param {object | null} storyboard storyboard or null.
 * @param {object | null} audio audio plan or null.
 * @returns {object} counts and durations.
 */
export function summarize(project, storyboard, audio) {
  const shots = listShots(storyboard)
  const plannedSeconds = roundSeconds(shots.reduce((total, entry) => total + entry.shot.durationSec, 0))
  const targetSeconds = project?.targetDurationSec ?? 0
  const statusCounts = {}
  for (const status of STATUSES) statusCounts[status] = 0
  for (const entry of shots) {
    const status = entry.shot.status
    if (Object.hasOwn(statusCounts, status)) statusCounts[status] += 1
    else statusCounts.other = (statusCounts.other ?? 0) + 1
  }
  const takes = shots.reduce((total, entry) => total + entry.shot.takes.length, 0)
  const selected = shots.reduce(
    (total, entry) => total + entry.shot.takes.filter(take => take.selected).length,
    0,
  )
  const tracks = { vo: 0, music: 0, sfx: 0, other: 0 }
  for (const track of audio?.tracks ?? []) {
    if (Object.hasOwn(tracks, track.kind)) tracks[track.kind] += 1
    else tracks.other += 1
  }
  return {
    scenes: storyboard?.scenes?.length ?? 0,
    shots: shots.length,
    plannedSeconds,
    targetSeconds: roundSeconds(targetSeconds),
    driftSeconds: roundSeconds(plannedSeconds - targetSeconds),
    driftRatio:
      targetSeconds > 0 ? Math.round(((plannedSeconds - targetSeconds) / targetSeconds) * 1000) / 1000 : 0,
    statusCounts,
    takes,
    selected,
    tracks,
  }
}

/* ------------------------------------------------------------------- review */

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 }
const FINDINGS_LIMIT = 100

function finding(code, severity, path, message, fix, data) {
  return { code, severity, path, message, fix, ...(data === undefined ? {} : { data }) }
}

function estimateSecondsPerChar(language) {
  return language === 'zh' ? 4.5 : 2.5
}

/** Parse "5s", "5", "5 秒" into seconds; null when absent. */
function parseDuration(value) {
  if (typeof value !== 'string') return null
  const match = /(\d+(?:\.\d+)?)/u.exec(value)
  return match === null ? null : Number(match[1])
}

/** Every file path the production references, deduplicated and capped. */
function collectReferencedFiles(project, storyboard) {
  const checks = []
  const seen = new Set()
  const add = (slot, path, label, filePath) => {
    if (typeof filePath !== 'string' || filePath === '') return
    const key = `${slot}:${filePath}`
    if (seen.has(key) || checks.length >= 120) return
    seen.add(key)
    checks.push({ slot, path, label, filePath })
  }
  for (const scene of storyboard?.scenes ?? []) {
    for (const shot of scene.shots) {
      for (const take of shot.takes) {
        add('take', `${FILE_NAMES.storyboard}:${shot.id}`, `Take ${take.id}`, take.file)
      }
      add('reference', `${FILE_NAMES.storyboard}:${shot.id}`, 'A first frame', shot.prompt.params.firstFrame)
      add('reference', `${FILE_NAMES.storyboard}:${shot.id}`, 'A last frame', shot.prompt.params.lastFrame)
      for (const reference of shot.prompt.params.references) {
        add('reference', `${FILE_NAMES.storyboard}:${shot.id}`, 'A reference image', reference)
      }
    }
  }
  for (const character of project?.characters ?? []) {
    for (const reference of character.references) {
      add('reference', `${FILE_NAMES.project}:character ${character.id}`, `Character ${character.id} reference`, reference)
    }
  }
  for (const reference of project?.style?.references ?? []) {
    add('reference', `${FILE_NAMES.project}:style`, 'A style reference', reference)
  }
  return checks
}

/** Up to three concrete next actions derived from the findings. */
function nextActions(findings, summary, project) {
  const actions = []
  const has = code => findings.some(item => item.code === code)
  if (has('UNREADABLE_FILE')) {
    actions.push('Fix the JSON file named in the UNREADABLE_FILE finding, then run video_review again.')
    return actions
  }
  if (has('PROJECT_MISSING') || project === null) {
    actions.push('Run video_project with action "init" to create the production.')
    return actions
  }
  if (has('MISSING_LOGLINE')) actions.push('Write the logline before designing more shots.')
  if (has('SHOT_MISSING_PROMPT') || has('SHOT_MISSING_ACTION')) {
    actions.push('Fill the shots that have no action or no prompt with video_storyboard update_shot.')
  }
  if (has('SHOT_MISSING_PRODUCT')) actions.push('Set prompt.product on every shot so the sheet names the platform.')
  if (has('DURATION_DRIFT')) {
    actions.push(`Adjust the cut: ${summary.plannedSeconds}s planned against ${summary.targetSeconds}s target.`)
  }
  if (has('SELECTED_TAKE_MISSING') || has('GENERATED_WITHOUT_TAKES')) {
    actions.push('Record the generated takes and select one per shot.')
  }
  if (has('MISSING_VO_FOR_DIALOGUE') || has('NO_MUSIC')) {
    actions.push('Finish the audio plan: voice-over for dialogue and a music bed.')
  }
  if (actions.length === 0) {
    actions.push(
      summary.shots === 0
        ? 'Add scenes and shots with video_storyboard.'
        : 'Review passes; hand the prompt sheet to the user and keep the take log current.',
    )
  }
  return actions.slice(0, 3)
}

/**
 * Deterministic review of one production. No writes, no network.
 *
 * @param {{
 *   project: object | null,
 *   storyboard: object | null,
 *   audio: object | null,
 *   errors?: Record<string, string>,
 *   exists?: (path: string) => Promise<boolean> | boolean,
 *   limits?: object,
 *   includeInfo?: boolean,
 * }} options review inputs.
 * @returns {Promise<object>} summary, findings and next actions.
 */
export async function reviewProduction(options) {
  const limits = options.limits ?? DEFAULT_LIMITS
  const includeInfo = options.includeInfo === true
  const project = options.project ?? null
  const storyboard = options.storyboard ?? null
  const audio = options.audio ?? null
  const errors = options.errors ?? {}
  const reviewed = []

  for (const [file, message] of Object.entries(errors)) {
    if (typeof message === 'string' && message !== '') {
      reviewed.push(finding('UNREADABLE_FILE', 'error', file, message, 'Fix the JSON, then run video_review again.'))
    }
  }

  if (project === null && !Object.hasOwn(errors, FILE_NAMES.project)) {
    reviewed.push(
      finding(
        'PROJECT_MISSING',
        'error',
        FILE_NAMES.project,
        'No project.json was found; this workspace has no production yet.',
        'Run video_project with action "init" to create the production.',
      ),
    )
  }
  if (storyboard === null && !Object.hasOwn(errors, FILE_NAMES.storyboard)) {
    reviewed.push(
      finding(
        'STORYBOARD_MISSING',
        'error',
        FILE_NAMES.storyboard,
        'No storyboard.json was found.',
        'Run video_project with action "init" to create the production.',
      ),
    )
  }
  if (audio === null && !Object.hasOwn(errors, FILE_NAMES.audio)) {
    reviewed.push(
      finding(
        'AUDIO_MISSING',
        'error',
        FILE_NAMES.audio,
        'No audio.json was found.',
        'Run video_project with action "init" to create the production.',
      ),
    )
  }

  const products = new Set(project?.products ?? [])
  const characters = new Set((project?.characters ?? []).map(character => character.id))
  const shots = listShots(storyboard)
  const sceneIds = new Set((storyboard?.scenes ?? []).map(scene => scene.id))
  const shotIds = new Set(shots.map(entry => entry.shot.id))
  const voiceTargets = new Set()
  for (const track of audio?.tracks ?? []) {
    if (track.kind === 'vo') {
      for (const shotId of track.shotIds) voiceTargets.add(shotId)
    }
  }

  if (project !== null) {
    if (project.logline === '') {
      reviewed.push(
        finding(
          'MISSING_LOGLINE',
          'warning',
          FILE_NAMES.project,
          'The project has no logline, so every shot is being designed without a story spine.',
          'Write one sentence: who wants what, what blocks it, how it ends.',
        ),
      )
    }
    if (project.targetDurationSec <= 0) {
      reviewed.push(
        finding(
          'MISSING_TARGET_DURATION',
          'warning',
          FILE_NAMES.project,
          'No target duration is set.',
          'Set target_duration_sec so the review can compare the cut against it.',
        ),
      )
    }
  }

  if (storyboard !== null) {
    const sceneIdCounts = new Map()
    const shotIdCounts = new Map()
    for (const scene of storyboard.scenes) {
      sceneIdCounts.set(scene.id, (sceneIdCounts.get(scene.id) ?? 0) + 1)
      for (const shot of scene.shots) shotIdCounts.set(shot.id, (shotIdCounts.get(shot.id) ?? 0) + 1)
    }
    for (const [id, count] of sceneIdCounts) {
      if (count > 1) {
        reviewed.push(
          finding('DUPLICATE_ID', 'error', `${FILE_NAMES.storyboard}:scene ${id}`, `Scene id "${id}" appears ${count} times.`, 'Give every scene a unique id.'),
        )
      }
    }
    for (const [id, count] of shotIdCounts) {
      if (count > 1) {
        reviewed.push(
          finding('DUPLICATE_ID', 'error', `${FILE_NAMES.storyboard}:shot ${id}`, `Shot id "${id}" appears ${count} times.`, 'Give every shot a unique id.'),
        )
      }
    }

    for (const scene of storyboard.scenes) {
      if (scene.shots.length === 0) {
        reviewed.push(
          finding(
            'SCENE_WITHOUT_SHOTS',
            'error',
            `${FILE_NAMES.storyboard}:scene ${scene.id}`,
            `Scene ${scene.id} has no shots.`,
            'Add at least one shot, or remove the scene.',
          ),
        )
      }
      if (scene.purpose === '') {
        reviewed.push(
          finding(
            'SCENE_PURPOSE_MISSING',
            'warning',
            `${FILE_NAMES.storyboard}:scene ${scene.id}`,
            `Scene ${scene.id} has no purpose (hook/setup/turn/payoff/cta).`,
            'Name what the scene does for the story.',
          ),
        )
      }
      for (const shot of scene.shots) {
        const path = `${FILE_NAMES.storyboard}:${shot.id}`
        const takeIdCounts = new Map()
        for (const take of shot.takes) takeIdCounts.set(take.id, (takeIdCounts.get(take.id) ?? 0) + 1)
        for (const [id, count] of takeIdCounts) {
          if (count > 1) {
            reviewed.push(
              finding('DUPLICATE_ID', 'error', `${path} take ${id}`, `Take id "${id}" appears ${count} times in shot ${shot.id}.`, 'Give every take a unique id.'),
            )
          }
        }
        if (!STATUSES.includes(shot.status)) {
          reviewed.push(
            finding(
              'UNKNOWN_STATUS',
              'warning',
              path,
              `Shot ${shot.id} has unknown status "${shot.status}".`,
              `Use one of: ${STATUSES.join(', ')}.`,
            ),
          )
        }
        if (shot.durationSec < limits.minShotSeconds || shot.durationSec > limits.maxShotSeconds) {
          reviewed.push(
            finding(
              'SHOT_INVALID_DURATION',
              'error',
              path,
              `Shot ${shot.id} is ${shot.durationSec}s; the configured range is ${limits.minShotSeconds}-${limits.maxShotSeconds}s.`,
              'Split or lengthen the shot so one generation can hold it.',
            ),
          )
        }
        if (shot.action === '') {
          reviewed.push(
            finding('SHOT_MISSING_ACTION', 'error', path, `Shot ${shot.id} has no action.`, 'Describe what moves on screen in one clause.'),
          )
        }
        if (shot.status !== 'planned' && shot.status !== 'dropped' && shot.prompt.text === '') {
          reviewed.push(
            finding('SHOT_MISSING_PROMPT', 'error', path, `Shot ${shot.id} is "${shot.status}" but has no prompt text.`, 'Write prompt.text, or move the status back to planned.'),
          )
        }
        if (shot.prompt.text.length > limits.maxPromptChars) {
          reviewed.push(
            finding(
              'PROMPT_TOO_LONG',
              'warning',
              path,
              `Shot ${shot.id}'s prompt is ${shot.prompt.text.length} characters (maxPromptChars ${limits.maxPromptChars}).`,
              'Keep one action and one camera move per shot; move the rest into style notes.',
            ),
          )
        }
        if (/(^|\n)\s*(负向|负面|negative)\s*[:：]/iu.test(shot.prompt.text)) {
          reviewed.push(
            finding(
              'PROMPT_CONTAINS_NEGATIVE_LABEL',
              'warning',
              path,
              `Shot ${shot.id}'s positive prompt contains a negative-prompt label.`,
              'Move that text into prompt.negative so the platform does not read it as subject matter.',
            ),
          )
        }
        if (shot.prompt.product === '') {
          reviewed.push(
            finding('SHOT_MISSING_PRODUCT', 'warning', path, `Shot ${shot.id} does not name the generation product.`, 'Set prompt.product so the user knows where to paste it.'),
          )
        } else if (products.size > 0 && !products.has(shot.prompt.product)) {
          reviewed.push(
            finding(
              'SHOT_MISSING_PRODUCT',
              'warning',
              path,
              `Shot ${shot.id} targets "${shot.prompt.product}", which is not in the project's products.`,
              `Use one of: ${[...products].join(', ')}, or add it to the project.`,
            ),
          )
        }
        if (shot.prompt.params.aspect === '') {
          reviewed.push(
            finding(
              'MISSING_ASPECT_IN_PARAMS',
              'warning',
              path,
              `Shot ${shot.id}'s prompt params do not carry an aspect ratio.`,
              'Set prompt.params.aspect so the pasted prompt matches the film.',
            ),
          )
        }
        const paramSeconds = parseDuration(shot.prompt.params.duration)
        if (paramSeconds !== null && Math.abs(paramSeconds - shot.durationSec) > 1) {
          reviewed.push(
            finding(
              'PROMPT_DURATION_MISMATCH',
              'warning',
              path,
              `Shot ${shot.id} plans ${shot.durationSec}s but asks the platform for ${shot.prompt.params.duration}.`,
              'Align the planned duration with the generation duration (or note the trim).',
            ),
          )
        }
        if (shot.takes.length > 0 && (shot.status === 'generated' || shot.status === 'selected')) {
          const selected = shot.takes.filter(take => take.selected)
          if (selected.length === 0) {
            reviewed.push(
              finding('SELECTED_TAKE_MISSING', 'error', path, `Shot ${shot.id} has takes but none is selected.`, 'Pick the take that will be used in the cut.'),
            )
          }
          if (selected.length > 1) {
            reviewed.push(
              finding('MULTIPLE_SELECTED_TAKES', 'error', path, `Shot ${shot.id} has ${selected.length} selected takes.`, 'Keep exactly one selected take.'),
            )
          }
        }
        if (shot.takes.length === 0 && (shot.status === 'generated' || shot.status === 'selected')) {
          reviewed.push(
            finding('GENERATED_WITHOUT_TAKES', 'error', path, `Shot ${shot.id} is "${shot.status}" but has no take recorded.`, 'Record the generated file with video_take, or move the status back.'),
          )
        }
        if (shot.dialogue !== '') {
          const covered =
            voiceTargets.has(shot.id) ||
            (audio?.tracks ?? []).some(track => track.kind === 'vo' && track.sceneId === scene.id)
          if (!covered) {
            reviewed.push(
              finding(
                'MISSING_VO_FOR_DIALOGUE',
                'warning',
                path,
                `Shot ${shot.id} has dialogue but no voice-over track covers it.`,
                'Add a vo track for this shot (or scene), or move the line to on-screen text.',
              ),
            )
          }
        }
        for (const characterId of shot.continuity.characters) {
          if (characters.size > 0 && !characters.has(characterId)) {
            reviewed.push(
              finding(
                'CHARACTER_UNDEFINED',
                'warning',
                path,
                `Shot ${shot.id} references character "${characterId}", which the project does not define.`,
                'Add the character to the project (look/wardrobe/references) so prompts stay consistent.',
              ),
            )
          }
        }
        if (shot.shotSize === '' && includeInfo) {
          reviewed.push(finding('SHOT_SIZE_MISSING', 'info', path, `Shot ${shot.id} has no shot size.`, 'Name the framing (特写/近景/中景/全景/远景).'))
        }
        if (shot.movement === '' && includeInfo) {
          reviewed.push(finding('MOVEMENT_MISSING', 'info', path, `Shot ${shot.id} has no camera movement.`, 'Say whether the camera is static or how it moves.'))
        }
      }
    }
  }

  let musicCount = 0
  let sfxCount = 0
  for (const track of audio?.tracks ?? []) {
    if (track.kind === 'music') musicCount += 1
    if (track.kind === 'sfx') sfxCount += 1
    if (track.kind === 'vo' && track.text !== '' && track.durationSec > 0) {
      const estimate = track.text.length / estimateSecondsPerChar(project?.language)
      if (estimate > track.durationSec + 1) {
        reviewed.push(
          finding(
            'VO_TOO_LONG',
            'warning',
            `${FILE_NAMES.audio}:${track.id}`,
            `VO ${track.id} reads as ~${Math.round(estimate)}s but is placed over ${track.durationSec}s.`,
            'Shorten the line or give it its own shot of room.',
          ),
        )
      }
    }
    if (track.sceneId !== '' && sceneIds.size > 0 && !sceneIds.has(track.sceneId)) {
      reviewed.push(
        finding('UNKNOWN_AUDIO_TARGET', 'warning', `${FILE_NAMES.audio}:${track.id}`, `Track ${track.id} targets unknown scene "${track.sceneId}".`, 'Point it at an existing scene or remove it.'),
      )
    }
    for (const shotId of track.shotIds) {
      if (shotIds.size > 0 && !shotIds.has(shotId)) {
        reviewed.push(
          finding('UNKNOWN_AUDIO_TARGET', 'warning', `${FILE_NAMES.audio}:${track.id}`, `Track ${track.id} targets unknown shot "${shotId}".`, 'Point it at an existing shot or remove it.'),
        )
      }
    }
  }
  const summary = summarize(project, storyboard, audio)
  if (audio !== null) {
    if (musicCount === 0) {
      reviewed.push(
        finding(
          'NO_MUSIC',
          'warning',
          FILE_NAMES.audio,
          'The production has no music track.',
          'Plan at least a start-push-land bed, or say explicitly that the film is silent.',
        ),
      )
    }
    if (sfxCount === 0 && includeInfo) {
      reviewed.push(
        finding('NO_SFX', 'info', FILE_NAMES.audio, 'The production has no sound-effect track.', 'Mark the action beats that need a sound.'),
      )
    }
  }
  if (project !== null && storyboard !== null && project.targetDurationSec > 0 && limits.durationTolerance >= 0) {
    const drift = Math.abs(summary.plannedSeconds - project.targetDurationSec) / project.targetDurationSec
    if (drift > limits.durationTolerance) {
      reviewed.push(
        finding(
          'DURATION_DRIFT',
          'warning',
          FILE_NAMES.storyboard,
          `The storyboard plans ${summary.plannedSeconds}s against a ${project.targetDurationSec}s target (${Math.round(drift * 100)}% off).`,
          'Trim or extend shots so the cut lands near the target before generating.',
          { plannedSeconds: summary.plannedSeconds, targetSeconds: project.targetDurationSec },
        ),
      )
    }
  }

  // File existence last: it is the only asynchronous rule.
  if (typeof options.exists === 'function') {
    for (const check of collectReferencedFiles(project, storyboard)) {
      let present = false
      try {
        present = await options.exists(check.filePath)
      } catch {
        present = false
      }
      if (!present) {
        reviewed.push(
          finding(
            check.slot === 'take' ? 'TAKE_FILE_MISSING' : 'REFERENCE_FILE_MISSING',
            'warning',
            check.path,
            `${check.label} points at "${check.filePath}", which does not exist under the production directory.`,
            check.slot === 'take'
              ? 'Move the generated file into the production folder, or correct the path.'
              : 'Add the reference image, or correct the path.',
          ),
        )
      }
    }
  }

  const findings = reviewed
    .sort((left, right) => {
      const severity = (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9)
      if (severity !== 0) return severity
      if (left.path !== right.path) return left.path.localeCompare(right.path)
      return left.code.localeCompare(right.code)
    })
    .slice(0, FINDINGS_LIMIT)

  return {
    summary,
    findings,
    truncated: reviewed.length > FINDINGS_LIMIT,
    next: nextActions(findings, summary, project),
  }
}
