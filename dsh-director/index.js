/**
 * `@litingyes/dsh-director` Host half.
 *
 * Mounts one production workspace and four model-facing surfaces:
 *
 *   1. six agent tools (`video_project`, `video_storyboard`, `video_take`,
 *      `video_audio`, `video_prompt`, `video_review`) that keep the production
 *      in `<session cwd>/video/` as project/storyboard/audio JSON;
 *   2. the embedded `ai-video-direction` skill, which carries the directing
 *      method (story structure, shot design, prompting, sound);
 *   3. one always-on prompt section that names the tools and the skill, so a
 *      request to "make an AI video" reaches them instead of a bare chat reply;
 *   4. a read-only `/dsh-director/api/state` route for the right-sidebar board.
 *
 * The plugin never generates video and never calls a generation service. Its
 * product is the prompt sheet — positive prompt, negative prompt and
 * parameters kept apart — plus the plan around it.
 *
 * Optional services are reached through `ctx.inject`, so a Host without a
 * web server or a skill registry still mounts the tools.
 *
 * @module @litingyes/dsh-director
 */

import { API_PREFIX, createApi } from './api.js'
import { ASPECTS, DEFAULT_LIMITS } from './production.js'
import { SKILL_NAME, skillDefinition } from './skill.js'
import { createTools } from './tools.js'

export const name = 'dsh-director'

/** Services the tools need; without them there is nowhere to write. */
export const inject = ['tools', 'fs', 'workingDirectory']

/** Bounds every numeric config field is validated against. */
const BOUNDS = {
  maxScenes: [1, 500],
  maxShotsPerScene: [1, 500],
  maxTakesPerShot: [1, 100],
  maxPromptChars: [100, 20000],
  minShotSeconds: [0.1, 60],
  maxShotSeconds: [1, 600],
  durationTolerance: [0, 1],
}

/** A production root is a relative POSIX path of safe segments. */
const ROOT_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u

/** Section order used when `MCP_SERVERS` is not resolvable on a newer runtime. */
const FALLBACK_SECTION_ORDER = 3200

/** Config defaults; a row may override any field. */
export const DEFAULT_CONFIG = Object.freeze({
  root: 'video',
  guidance: true,
  skill: true,
  defaultAspect: '9:16',
  ...DEFAULT_LIMITS,
})

function assertInteger(key, value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`dsh-director: ${key} must be an integer, got ${JSON.stringify(value)}`)
  }
  const [min, max] = BOUNDS[key]
  if (value < min || value > max) {
    throw new TypeError(`dsh-director: ${key} must be between ${min} and ${max}, got ${value}`)
  }
  return value
}

function assertNumber(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`dsh-director: ${key} must be a finite number, got ${JSON.stringify(value)}`)
  }
  const [min, max] = BOUNDS[key]
  if (value < min || value > max) {
    throw new TypeError(`dsh-director: ${key} must be between ${min} and ${max}, got ${value}`)
  }
  return value
}

function assertBoolean(key, value) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`dsh-director: ${key} must be a boolean, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Validate the row config and fill explicit defaults.
 *
 * Invalid values fail the row at mount rather than degrading silently later.
 *
 * @param {Record<string, unknown> | undefined} raw the row's `config`.
 * @returns {object} resolved config.
 */
export function resolveConfig(raw) {
  const config = raw ?? {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('dsh-director: config must be an object')
  }
  const root = config.root ?? DEFAULT_CONFIG.root
  const unsafeSegments =
    typeof root === 'string' && root.split('/').some(segment => segment === '.' || segment === '..')
  if (typeof root !== 'string' || root.length > 120 || !ROOT_PATTERN.test(root) || unsafeSegments) {
    throw new TypeError(
      `dsh-director: root must be a relative POSIX path of safe segments (no "..", no absolute path, max 120 chars), got ${JSON.stringify(root)}`,
    )
  }
  const defaultAspect = config.defaultAspect ?? DEFAULT_CONFIG.defaultAspect
  if (!ASPECTS.includes(defaultAspect)) {
    throw new TypeError(
      `dsh-director: defaultAspect must be one of ${ASPECTS.join(', ')}, got ${JSON.stringify(defaultAspect)}`,
    )
  }
  const minShotSeconds = assertNumber('minShotSeconds', config.minShotSeconds ?? DEFAULT_CONFIG.minShotSeconds)
  const maxShotSeconds = assertNumber('maxShotSeconds', config.maxShotSeconds ?? DEFAULT_CONFIG.maxShotSeconds)
  if (maxShotSeconds <= minShotSeconds) {
    throw new TypeError(
      `dsh-director: maxShotSeconds (${maxShotSeconds}) must be greater than minShotSeconds (${minShotSeconds})`,
    )
  }
  return {
    root,
    guidance: assertBoolean('guidance', config.guidance ?? DEFAULT_CONFIG.guidance),
    skill: assertBoolean('skill', config.skill ?? DEFAULT_CONFIG.skill),
    defaultAspect,
    maxScenes: assertInteger('maxScenes', config.maxScenes ?? DEFAULT_CONFIG.maxScenes),
    maxShotsPerScene: assertInteger('maxShotsPerScene', config.maxShotsPerScene ?? DEFAULT_CONFIG.maxShotsPerScene),
    maxTakesPerShot: assertInteger('maxTakesPerShot', config.maxTakesPerShot ?? DEFAULT_CONFIG.maxTakesPerShot),
    maxPromptChars: assertInteger('maxPromptChars', config.maxPromptChars ?? DEFAULT_CONFIG.maxPromptChars),
    minShotSeconds,
    maxShotSeconds,
    durationTolerance: assertNumber('durationTolerance', config.durationTolerance ?? DEFAULT_CONFIG.durationTolerance),
  }
}

/**
 * The model-facing trigger text.
 *
 * It names the exact tools, says where the production lives, states that the
 * plugin only produces prompts (not video), and gives the one case that should
 * skip it. The skill sentence is only included while the skill is registered.
 *
 * @param {object} config resolved config.
 * @param {{ withSkill: boolean }} options whether the skill was registered.
 * @returns {string} prompt section text.
 */
export function guidanceText(config, options = {}) {
  const root = config.root === '' ? 'the configured root' : `\`${config.root}/\``
  const skill = options.withSkill
    ? `load the \`${SKILL_NAME}\` skill (it carries the directing method), then `
    : ''
  return (
    `AI video direction: when the user wants to make an AI video (a story short, product film, explainer) or asks about story structure, storyboarding, shot design, audio-visual planning, or prompts for AI video products such as 可灵/即梦/海螺: ${skill}` +
    `keep the production in ${root} with the \`video_project\`, \`video_storyboard\`, \`video_take\`, \`video_audio\`, \`video_prompt\` and \`video_review\` tools. ` +
    'This plugin produces paste-ready prompts and plans, never video: hand the user the positive prompt, the negative prompt and the parameters separately to paste into their generation platform. ' +
    'Update the project files instead of leaving decisions in chat, and run `video_review` before handing work back. ' +
    'Skip this for one-off questions that do not produce a video.'
  )
}

/**
 * Place the guidance right after the MCP section, where tool-level guidance
 * already lives; fall back to a fixed finite order on a runtime that no longer
 * resolves that name.
 */
function sectionOrder(systemPrompt) {
  const base =
    typeof systemPrompt.getSectionOrder === 'function' ? systemPrompt.getSectionOrder('MCP_SERVERS') : undefined
  return Number.isFinite(base) ? base + 100 : FALLBACK_SECTION_ORDER
}

/**
 * Answer the trust question the same way `dsh-git` does: no connection service
 * means no peer-auth plane (trusted); a connection that throws must never read
 * as "no auth".
 */
function makeAuthorize(scoped) {
  return req => {
    let connection
    try {
      connection = scoped.get('connection')
    } catch {
      return 401
    }
    if (connection === undefined || connection === null) return undefined
    if (typeof connection.requestRejection !== 'function') return undefined
    return connection.requestRejection(req)
  }
}

/**
 * Mount the tools, the skill, the guidance section and the panel route.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx the row's context.
 * @param {Record<string, unknown>} [rawConfig] the row's `config`.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)

  /** Whether the skill service accepted the embedded skill; read at render time. */
  const state = { skillRegistered: false }

  for (const definition of createTools({ ctx, config })) {
    ctx.tools.register(definition)
  }

  if (config.skill) {
    ctx.inject(['skills'], scoped => {
      scoped.skills.register(skillDefinition())
      state.skillRegistered = true
    })
  }

  if (config.guidance) {
    ctx.inject(['systemPrompt', 'tools'], host => {
      host.systemPrompt.section({
        name: 'dsh-director:guidance',
        order: sectionOrder(host.systemPrompt),
        interpolate: false,
        /**
         * Registered for the whole Host, so it renders for every Agent. Keep it
         * empty while the tools it names are absent (row disabled or a rename
         * that did not reach this config).
         */
        text: (context = {}) => {
          const scope = context?.scope
          if (host.tools.get('video_project', scope) === undefined) return ''
          return guidanceText(config, { withSkill: state.skillRegistered })
        },
      })
    })
  }

  ctx.inject(['webServer', 'workspaceRegistry'], scoped => {
    const workspaces = () => {
      const registry = scoped.workspaceRegistry
      const entries = typeof registry?.list === 'function' ? registry.list() : []
      return entries.map(entry => ({ id: String(entry.id), title: entry.title, path: entry.path }))
    }
    const authorize = makeAuthorize(scoped)
    scoped.effect(() => {
      const handler = createApi({ config, authorize, workspaces })
      // `kind: 'prefix'` owns `/dsh-director` and everything below it.
      const dispose = scoped.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    }, 'dsh-director: api route')
  })
}
