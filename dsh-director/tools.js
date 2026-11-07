/**
 * The six model-facing tools of `@litingyes/dsh-director`.
 *
 * Definitions are plain objects with hand-written JSON Schema (the same wire
 * shape `defineTool` compiles to), because the Host half stays dependency-free:
 * a bundle installed as a directory must not need a build step or extra packages
 * just to register tools. Only the supported schema subset is used —
 * type/properties/required/additionalProperties/items/enum/description.
 *
 * Every mutation follows the same path: resolve the Session cwd, load the three
 * JSON files through `ctx.fs`, apply a pure domain mutation, write one file back
 * with its read version. A version conflict becomes `VIDEO_STALE`, never a
 * silent overwrite.
 *
 * @module @litingyes/dsh-director/tools
 */

import {
  ASPECTS,
  FILE_NAMES,
  PURPOSES,
  STATUSES,
  TRACK_KINDS,
  VideoError,
  addScene,
  addShot,
  addTake,
  addTrack,
  applyProjectFields,
  createEmptyAudio,
  createEmptyStoryboard,
  createProject,
  findShot,
  listShots,
  removeScene,
  removeShot,
  removeTake,
  removeTrack,
  reorderShot,
  reviewProduction,
  selectTake,
  summarize,
  updateScene,
  updateShot,
  updateTake,
  updateTrack,
} from './production.js'
import { fileExists, initProduction, loadProduction, saveFile } from './store.js'
import { promptBlock, promptFields, promptSheet, paramLine } from './src/shared/prompt.js'

/** Seconds rendered as `4s` / `3.5s`. */
function seconds(value) {
  return `${Math.round(value * 10) / 10}s`
}

/** Keep one-line previews short. */
function clip(value, max) {
  const text = String(value ?? '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function textBlock(value) {
  return [{ type: 'text', text: value }]
}

function linesOf(parts) {
  return parts.filter(part => typeof part === 'string' && part !== '').join('\n')
}

function summaryLine(summary) {
  const parts = [
    `${summary.scenes} scene(s)`,
    `${summary.shots} shot(s)`,
    `${seconds(summary.plannedSeconds)} planned`,
  ]
  if (summary.targetSeconds > 0) parts.push(`${seconds(summary.targetSeconds)} target`)
  parts.push(`${summary.takes} take(s)`, `${summary.selected} selected`)
  return parts.join(' · ')
}

function statusLine(summary) {
  const counts = Object.entries(summary.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${count}`)
  return counts.length === 0 ? '' : `status: ${counts.join(' · ')}`
}

function shotLine(shot) {
  return [
    `${shot.id} ${seconds(shot.durationSec)} [${shot.status}]`,
    [shot.shotSize, shot.movement].filter(Boolean).join('/'),
    clip(shot.subject || shot.action, 60),
    shot.prompt.text === '' ? 'no prompt' : 'prompt ready',
  ]
    .filter(Boolean)
    .join(' · ')
}

function compactScene(scene) {
  return { id: scene.id, title: scene.title, purpose: scene.purpose }
}

function takeLine(take) {
  const rating = take.rating > 0 ? ` ${take.rating}★` : ''
  return `${take.id}${take.selected ? '*' : ''}${rating}${take.file === '' ? '' : ` ${take.file}`}`
}

const SCENE_INPUT = {
  type: 'object',
  additionalProperties: false,
  description: 'Scene fields. purpose is the narrative job of the scene.',
  properties: {
    title: { type: 'string', description: 'Scene title, e.g. "监控室".' },
    purpose: {
      type: 'string',
      enum: [...PURPOSES],
      description: 'Narrative job: hook, setup, turn, payoff or cta.',
    },
    summary: { type: 'string', description: 'One sentence about what happens in the scene.' },
    location: { type: 'string', description: 'Where it happens.' },
    time_of_day: { type: 'string', description: 'Time of day, e.g. "凌晨 3 点".' },
  },
}

const PROMPT_PARAMS_INPUT = {
  type: 'object',
  additionalProperties: false,
  description:
    'Platform parameters kept apart from the prompt text. Leave a field empty when the platform does not need it.',
  properties: {
    duration: { type: 'string', description: 'Generation duration, e.g. "5s".' },
    aspect: { type: 'string', description: 'Aspect ratio, e.g. "9:16".' },
    firstFrame: { type: 'string', description: 'Project-relative path to a first-frame image.' },
    lastFrame: { type: 'string', description: 'Project-relative path to a last-frame image.' },
    references: {
      type: 'array',
      items: { type: 'string' },
      description: 'Project-relative paths to reference images.',
    },
    seed: { type: 'string', description: 'Seed when the platform exposes one.' },
    extra: { type: 'string', description: 'Platform-specific settings the user should copy.' },
  },
}

const PROMPT_INPUT = {
  type: 'object',
  additionalProperties: false,
  description:
    'Paste-ready prompt. text is the positive prompt only; negative is the negative prompt; params carry duration/aspect/references.',
  properties: {
    text: { type: 'string', description: 'Positive prompt: subject + action + environment + camera + light + style.' },
    negative: { type: 'string', description: 'Negative prompt; never put this inside text.' },
    product: { type: 'string', description: 'Generation product the prompt targets, e.g. "可灵".' },
    params: PROMPT_PARAMS_INPUT,
  },
}

const SHOT_INPUT_PROPERTIES = {
  duration_sec: {
    type: 'number',
    description: 'Duration of one generation, in seconds. One shot holds one action.',
  },
  shot_size: { type: 'string', description: 'Framing: 特写 / 近景 / 中景 / 全景 / 远景.' },
  angle: { type: 'string', description: 'Camera angle: 平视 / 俯拍 / 仰拍.' },
  movement: { type: 'string', description: 'Camera movement: 固定 / 缓推 / 缓拉 / 横移 / 跟随 / 环绕 / 手持.' },
  subject: { type: 'string', description: 'Who or what the shot is about.' },
  action: { type: 'string', description: 'The one action that happens in this shot, in one clause.' },
  dialogue: { type: 'string', description: 'Spoken line in this shot, if any.' },
  on_screen_text: { type: 'string', description: 'Text burned into the frame, if any.' },
  audio: {
    type: 'object',
    additionalProperties: false,
    description: 'Per-shot sound intent: voice-over, sound effects, music mood.',
    properties: {
      vo: { type: 'string', description: 'Voice-over line for this shot.' },
      sfx: { type: 'array', items: { type: 'string' }, description: 'Sound-effect cues.' },
      music: { type: 'string', description: 'Music mood or cue.' },
    },
  },
  prompt: PROMPT_INPUT,
  continuity: {
    type: 'object',
    additionalProperties: false,
    description: 'What must stay consistent across shots.',
    properties: {
      characters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Character ids defined on the project.',
      },
      props: { type: 'array', items: { type: 'string' }, description: 'Props that must match other shots.' },
      notes: { type: 'string', description: 'Continuity notes.' },
    },
  },
  status: {
    type: 'string',
    enum: [...STATUSES],
    description: 'Lifecycle: planned, prompt_ready, generating, generated, selected, dropped.',
  },
}

const SHOT_ADD_INPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['duration_sec'],
  description: 'A new shot. duration_sec is required; everything else fills in as the design firms up.',
  properties: SHOT_INPUT_PROPERTIES,
}

const SHOT_UPDATE_INPUT = {
  type: 'object',
  additionalProperties: false,
  description:
    'Fields to change. Only provided fields are merged; prompt params merge one level deep, so updating prompt.text keeps the existing negative prompt.',
  properties: SHOT_INPUT_PROPERTIES,
}

const TAKE_INPUT = {
  type: 'object',
  additionalProperties: false,
  description: 'One generated take. file is a project-relative path; it may be added later.',
  properties: {
    file: { type: 'string', description: 'Project-relative path, e.g. assets/takes/S1-01/t1.mp4.' },
    rating: { type: 'integer', description: 'Your rating from 1 to 5.' },
    notes: { type: 'string', description: 'What worked, what failed, why it was kept or dropped.' },
  },
}

const TRACK_PROPERTIES = {
  kind: { type: 'string', enum: [...TRACK_KINDS], description: 'vo, music or sfx.' },
  scene_id: { type: 'string', description: 'Scene this cue belongs to.' },
  shot_ids: { type: 'array', items: { type: 'string' }, description: 'Shots this cue covers.' },
  text: { type: 'string', description: 'Voice-over or on-screen line.' },
  file: { type: 'string', description: 'Project-relative path to an audio file.' },
  start_sec: { type: 'number', description: 'Start time in seconds from the film start.' },
  duration_sec: { type: 'number', description: 'Length in seconds.' },
  notes: { type: 'string', description: 'Performance or mix notes.' },
}

const TRACK_ADD_INPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  description:
    'One audio cue. vo and sfx need scene_id or shot_ids; music may target the whole film. Text is used for voice-over; file for recorded audio.',
  properties: TRACK_PROPERTIES,
}

const TRACK_UPDATE_INPUT = {
  type: 'object',
  additionalProperties: false,
  description: 'Fields to change on an audio cue.',
  properties: TRACK_PROPERTIES,
}

const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true }

/**
 * Build the six tool definitions bound to one mounted plugin instance.
 *
 * @param {{ ctx: object, config: object }} options plugin context and resolved config.
 * @returns {Array<object>} plain tool definitions for `ctx.tools.register`.
 */
export function createTools(options) {
  const ctx = options.ctx
  const config = options.config
  const limits = {
    maxScenes: config.maxScenes,
    maxShotsPerScene: config.maxShotsPerScene,
    maxTakesPerShot: config.maxTakesPerShot,
    maxPromptChars: config.maxPromptChars,
    minShotSeconds: config.minShotSeconds,
    maxShotSeconds: config.maxShotSeconds,
    durationTolerance: config.durationTolerance,
  }

  /** Resolve the Session cwd; a standalone (agent-less) call is refused. */
  async function workspace(exec) {
    if (exec?.agent === undefined) {
      throw new VideoError('VIDEO_NO_AGENT', 'video tools run inside a Session; there is no working directory to write to')
    }
    const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
    if (typeof cwd !== 'string' || cwd.trim() === '') {
      throw new VideoError('VIDEO_NO_AGENT', 'this Session has no working directory yet')
    }
    return cwd
  }

  async function load(exec) {
    const cwd = await workspace(exec)
    const production = await loadProduction({
      fs: ctx.fs,
      cwd,
      root: config.root,
      signal: exec.signal,
    })
    return { cwd, production }
  }

  function requireFile(production, name, key) {
    if (production[key] !== null) return production[key]
    const message = production.errors[name]
    if (typeof message === 'string' && message !== '') {
      throw new VideoError('VIDEO_BAD_JSON', message)
    }
    throw new VideoError(
      'VIDEO_PROJECT_MISSING',
      `${name} is missing under the production root; run video_project with action "init" first`,
    )
  }

  async function save(exec, cwd, production, file, data) {
    await saveFile({
      fs: ctx.fs,
      cwd,
      root: config.root,
      file,
      data,
      version: production.versions[file],
      signal: exec.signal,
    })
  }

  function result(action, production, extra) {
    return {
      ok: true,
      action,
      path: production.paths?.rootDir ?? '',
      summary: summarize(production.project, production.storyboard, production.audio),
      ...extra,
    }
  }

  /* ------------------------------------------------------------- renderers */

  function projectRender(value) {
    const lines = [summaryLine(value.summary)]
    lines.push(statusLine(value.summary))
    if (value.project !== null && value.project !== undefined) {
      lines.push(
        `${value.project.title}${value.project.aspect === '' ? '' : ` · ${value.project.aspect}`}`,
        value.project.logline === '' ? '' : `logline: ${clip(value.project.logline, 160)}`,
      )
      if (value.project.products.length > 0) lines.push(`products: ${value.project.products.join(', ')}`)
      if (Object.keys(value.errors ?? {}).length > 0) {
        for (const [file, message] of Object.entries(value.errors)) lines.push(`error ${file}: ${clip(message, 200)}`)
      }
    } else {
      lines.push(`no production yet under ${config.root}/ — run video_project action "init"`)
    }
    return textBlock(linesOf(lines))
  }

  function storyboardRender(value) {
    const lines = []
    if (Array.isArray(value.entries) && value.entries.length > 0) {
      let sceneId = ''
      for (const entry of value.entries) {
        if (entry.scene.id !== sceneId) {
          sceneId = entry.scene.id
          lines.push(
            `${sceneId} ${clip(entry.scene.title, 40)}${entry.scene.purpose === '' ? '' : ` (${entry.scene.purpose})`}`,
          )
        }
        lines.push(`  ${shotLine(entry.shot)}`)
      }
    } else if (value.shot !== undefined && value.shot !== null && value.shot.durationSec !== undefined) {
      lines.push(
        `${value.shot.id} ${seconds(value.shot.durationSec)} [${value.shot.status}]`,
        `framing: ${[value.shot.shotSize, value.shot.angle, value.shot.movement].filter(Boolean).join(' / ') || '(empty)'}`,
        `subject: ${value.shot.subject || '(empty)'}`,
        `action: ${value.shot.action || '(empty)'}`,
      )
      if (value.shot.prompt.text !== '') lines.push(`prompt: ${clip(value.shot.prompt.text, 300)}`)
      if (value.shot.takes.length > 0) {
        lines.push(`takes: ${value.shot.takes.map(take => takeLine(take)).join(', ')}`)
      }
    } else if (value.action !== undefined && String(value.action).startsWith('remove')) {
      lines.push(`${value.action}: ${value.shot?.id ?? value.scene?.id ?? '(unknown)'}`)
    } else if (value.scene !== undefined && value.scene !== null) {
      lines.push(
        `${value.action}: ${value.scene.id} ${clip(value.scene.title ?? '', 40)}${value.scene.purpose === undefined ? '' : ` (${value.scene.purpose})`}`,
      )
    } else {
      lines.push(`${config.root}/ has no scenes yet`)
    }
    lines.push(summaryLine(value.summary))
    return textBlock(linesOf(lines))
  }

  function takeRender(value) {
    const lines = []
    if (Array.isArray(value.shots)) {
      if (value.shots.length === 0) lines.push('no takes recorded yet')
      for (const entry of value.shots) {
        lines.push(`${entry.shotId}: ${entry.takes.map(take => takeLine(take)).join(', ')}`)
      }
    } else if (value.shot !== undefined && value.shot !== null) {
      lines.push(shotLine(value.shot))
      if (value.take !== undefined && value.take !== null) lines.push(`take: ${takeLine(value.take)}`)
      if (value.shot.takes.length > 0) {
        lines.push(`all takes: ${value.shot.takes.map(take => takeLine(take)).join(', ')}`)
      }
    }
    lines.push(summaryLine(value.summary))
    return textBlock(linesOf(lines))
  }

  function audioRender(value) {
    const lines = []
    if (Array.isArray(value.tracks)) {
      if (value.tracks.length === 0) lines.push('no audio plan yet')
      for (const track of value.tracks) {
        const target = [
          track.sceneId === '' ? '' : track.sceneId,
          track.shotIds.length > 0 ? track.shotIds.join(',') : '',
        ]
          .filter(Boolean)
          .join('/')
        lines.push(
          `${track.id} ${track.kind}${target === '' ? ' (whole film)' : ` → ${target}`}${
            track.durationSec > 0 ? ` ${seconds(track.durationSec)}` : ''
          }${track.text === '' ? '' : ` · ${clip(track.text, 80)}`}${track.file === '' ? '' : ` · ${track.file}`}`,
        )
      }
    } else if (value.track !== undefined && value.track !== null) {
      lines.push(`${value.action}: ${value.track.id}${value.track.kind === undefined ? '' : ` ${value.track.kind}`}`)
    }
    lines.push(summaryLine(value.summary))
    return textBlock(linesOf(lines))
  }

  /* ----------------------------------------------------------------- tools */

  const projectTool = {
    name: 'video_project',
    description:
      'Read, create or update the AI video production kept in the Session workspace. `init` creates project.json, storyboard.json and audio.json under the configured root and never overwrites an existing project; `read` returns the project plus production counts and any file that failed to parse; `update` merges project fields (characters and style replace wholesale). Start here when the user wants to make an AI video, and keep the project current as decisions are made. This plugin only writes prompts and plans, never video.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['init', 'read', 'update'], description: 'What to do.' },
        title: { type: 'string', description: 'Working title.' },
        logline: { type: 'string', description: 'One sentence: who wants what, what blocks it, how it ends.' },
        goal: { type: 'string', description: 'What the video should achieve.' },
        platform: { type: 'string', description: 'Where it will be published, e.g. 抖音.' },
        aspect: { type: 'string', enum: [...ASPECTS], description: 'Aspect ratio.' },
        target_duration_sec: { type: 'number', description: 'Target duration in seconds.' },
        genre: { type: 'string', description: 'e.g. 故事短片.' },
        tone: { type: 'string', description: 'e.g. 冷、克制.' },
        audience: { type: 'string', description: 'Who it is for.' },
        language: { type: 'string', description: 'Language of dialogue and prompts, e.g. zh.' },
        products: {
          type: 'array',
          items: { type: 'string' },
          description: 'Generation products the user has access to, e.g. ["可灵"].',
        },
        characters: {
          type: 'array',
          description: 'Character bible; replaces the whole list when provided.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Stable id, e.g. "guard".' },
              name: { type: 'string' },
              look: { type: 'string', description: 'Face, build, age, hair — the part prompts must repeat.' },
              wardrobe: { type: 'string' },
              voice: { type: 'string' },
              references: {
                type: 'array',
                items: { type: 'string' },
                description: 'Project-relative reference images.',
              },
            },
          },
        },
        style: {
          type: 'object',
          additionalProperties: false,
          description: 'Visual bible; replaces the whole object when provided.',
          properties: {
            look: { type: 'string' },
            palette: { type: 'array', items: { type: 'string' } },
            references: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
        },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => projectRender(value) },
    async execute(args, exec) {
      const action = args.action
      if (action === 'init') {
        const cwd = await workspace(exec)
        const project = createProject(args, { aspect: config.defaultAspect })
        const created = await initProduction({
          fs: ctx.fs,
          cwd,
          root: config.root,
          project,
          storyboard: createEmptyStoryboard(() => project.updatedAt),
          audio: createEmptyAudio(() => project.updatedAt),
          signal: exec.signal,
        })
        const after = await loadProduction({ fs: ctx.fs, cwd, root: config.root, signal: exec.signal })
        const production = { ...after, paths: created.paths }
        return result('init', production, {
          project: production.project,
          errors: after.errors,
          missing: false,
        })
      }

      if (action === 'read') {
        const { production } = await load(exec)
        return result('read', production, {
          project: production.project,
          errors: production.errors,
          missing: production.project === null && production.errors[FILE_NAMES.project] === undefined,
        })
      }

      if (action === 'update') {
        const { cwd, production } = await load(exec)
        const project = requireFile(production, FILE_NAMES.project, 'project')
        const updated = applyProjectFields(project, args, {})
        await save(exec, cwd, production, FILE_NAMES.project, updated)
        return result('update', { ...production, project: updated }, { project: updated, errors: production.errors })
      }

      throw new VideoError('VIDEO_INVALID_INPUT', `unknown action "${String(action)}"`)
    },
  }

  const storyboardTool = {
    name: 'video_storyboard',
    description:
      'Keep the scene list and shot list of the production. `list` returns a compact table (or one full shot when shot_id is set); add/update scenes and shots; reorder or remove them. One shot should hold one action that a single generation can complete. Removing a scene or a shot that still holds takes needs force: true.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: [
            'list',
            'add_scene',
            'update_scene',
            'remove_scene',
            'add_shot',
            'update_shot',
            'reorder_shot',
            'remove_shot',
          ],
          description: 'What to do.',
        },
        scene_id: { type: 'string', description: 'Target scene id, e.g. S1.' },
        shot_id: { type: 'string', description: 'Target shot id, e.g. S1-01.' },
        status: { type: 'string', enum: [...STATUSES], description: 'Filter for list.' },
        position: { type: 'integer', description: '0-based position for reorder_shot inside its scene.' },
        force: { type: 'boolean', description: 'Confirm a removal that deletes shots or takes.' },
        scene: SCENE_INPUT,
        shot: SHOT_ADD_INPUT,
        patch: SHOT_UPDATE_INPUT,
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => storyboardRender(value) },
    async execute(args, exec) {
      const action = args.action
      const { cwd, production } = await load(exec)
      const storyboard = requireFile(production, FILE_NAMES.storyboard, 'storyboard')

      if (action === 'list') {
        if (typeof args.shot_id === 'string' && args.shot_id !== '') {
          const found = findShot(storyboard, args.shot_id)
          return result('list', production, {
            shot: found.shot,
            scene: compactScene(found.scene),
            entries: [],
          })
        }
        let entries = listShots(storyboard)
        if (typeof args.scene_id === 'string' && args.scene_id !== '') {
          entries = entries.filter(entry => entry.scene.id === args.scene_id)
        }
        if (typeof args.status === 'string' && args.status !== '') {
          entries = entries.filter(entry => entry.shot.status === args.status)
        }
        return result('list', production, {
          entries: entries.map(entry => ({ scene: compactScene(entry.scene), shot: entry.shot })),
        })
      }

      if (action === 'add_scene') {
        const next = addScene(storyboard, args.scene ?? {}, { limits })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const added = next.scenes[next.scenes.length - 1]
        return result('add_scene', { ...production, storyboard: next }, { scene: compactScene(added), entries: [] })
      }

      if (action === 'update_scene') {
        if (typeof args.scene_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'scene_id is required')
        const next = updateScene(storyboard, args.scene_id, args.scene ?? {}, {})
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const scene = next.scenes.find(entry => entry.id === args.scene_id)
        return result('update_scene', { ...production, storyboard: next }, {
          scene: scene === undefined ? { id: args.scene_id } : compactScene(scene),
          entries: [],
        })
      }

      if (action === 'remove_scene') {
        if (typeof args.scene_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'scene_id is required')
        const next = removeScene(storyboard, args.scene_id, { force: args.force === true })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        return result('remove_scene', { ...production, storyboard: next }, {
          scene: { id: args.scene_id },
          entries: [],
        })
      }

      if (action === 'add_shot') {
        if (typeof args.scene_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'scene_id is required')
        if (args.shot === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'shot is required')
        const next = addShot(storyboard, args.scene_id, args.shot, { limits })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const scene = next.scenes.find(entry => entry.id === args.scene_id)
        const shot = scene?.shots?.[scene.shots.length - 1]
        return result('add_shot', { ...production, storyboard: next }, {
          scene: scene === undefined ? { id: args.scene_id } : compactScene(scene),
          shot,
          entries: [],
        })
      }

      if (action === 'update_shot') {
        if (typeof args.shot_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'shot_id is required')
        if (args.patch === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'patch is required')
        const next = updateShot(storyboard, args.shot_id, args.patch, { limits })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('update_shot', { ...production, storyboard: next }, {
          shot: found.shot,
          scene: compactScene(found.scene),
          entries: [],
        })
      }

      if (action === 'reorder_shot') {
        if (typeof args.shot_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'shot_id is required')
        if (!Number.isInteger(args.position)) throw new VideoError('VIDEO_INVALID_INPUT', 'position is required')
        const next = reorderShot(storyboard, args.shot_id, args.position, {})
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('reorder_shot', { ...production, storyboard: next }, {
          shot: found.shot,
          scene: compactScene(found.scene),
          entries: [],
        })
      }

      if (action === 'remove_shot') {
        if (typeof args.shot_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'shot_id is required')
        const next = removeShot(storyboard, args.shot_id, { force: args.force === true })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        return result('remove_shot', { ...production, storyboard: next }, {
          shot: { id: args.shot_id },
          entries: [],
        })
      }

      throw new VideoError('VIDEO_INVALID_INPUT', `unknown action "${String(action)}"`)
    },
  }

  const takeTool = {
    name: 'video_take',
    description:
      'Record the videos the user generated on the platform. Add a take with the file path and notes, select the one that will be used, or update and remove takes. Adding the first take moves a planned shot to generated; selecting one moves it to selected. This is how the production stays a take log instead of losing results in chat.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'select', 'update', 'remove'], description: 'What to do.' },
        shot_id: { type: 'string', description: 'Target shot id.' },
        take_id: { type: 'string', description: 'Target take id, e.g. t1.' },
        take: TAKE_INPUT,
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => takeRender(value) },
    async execute(args, exec) {
      const action = args.action
      const { cwd, production } = await load(exec)
      const storyboard = requireFile(production, FILE_NAMES.storyboard, 'storyboard')

      if (action === 'list') {
        if (typeof args.shot_id === 'string' && args.shot_id !== '') {
          const found = findShot(storyboard, args.shot_id)
          return result('list', production, { shot: found.shot, takes: found.shot.takes })
        }
        const shots = listShots(storyboard)
          .filter(entry => entry.shot.takes.length > 0)
          .map(entry => ({ shotId: entry.shot.id, takes: entry.shot.takes }))
        return result('list', production, { shots })
      }

      if (typeof args.shot_id !== 'string' || args.shot_id === '') {
        throw new VideoError('VIDEO_INVALID_INPUT', 'shot_id is required')
      }

      if (action === 'add') {
        if (args.take === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'take is required')
        const next = addTake(storyboard, args.shot_id, args.take, { limits })
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('add', { ...production, storyboard: next }, {
          shot: found.shot,
          take: found.shot.takes[found.shot.takes.length - 1],
        })
      }

      if (action === 'select') {
        if (typeof args.take_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'take_id is required')
        const next = selectTake(storyboard, args.shot_id, args.take_id, {})
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('select', { ...production, storyboard: next }, {
          shot: found.shot,
          take: found.shot.takes.find(take => take.id === args.take_id),
        })
      }

      if (action === 'update') {
        if (typeof args.take_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'take_id is required')
        if (args.take === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'take is required')
        const next = updateTake(storyboard, args.shot_id, args.take_id, args.take, {})
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('update', { ...production, storyboard: next }, {
          shot: found.shot,
          take: found.shot.takes.find(take => take.id === args.take_id),
        })
      }

      if (action === 'remove') {
        if (typeof args.take_id !== 'string') throw new VideoError('VIDEO_INVALID_INPUT', 'take_id is required')
        const next = removeTake(storyboard, args.shot_id, args.take_id, {})
        await save(exec, cwd, production, FILE_NAMES.storyboard, next)
        const found = findShot(next, args.shot_id)
        return result('remove', { ...production, storyboard: next }, { shot: found.shot })
      }

      throw new VideoError('VIDEO_INVALID_INPUT', `unknown action "${String(action)}"`)
    },
  }

  const audioTool = {
    name: 'video_audio',
    description:
      'Keep the audio plan: voice-over, music and sound effects, each tied to a scene or shots. Voice-over is the priority — dialogue without a vo track is a hole. Music can target the whole film when no scene is given. This is a plan the user records or generates elsewhere, not audio rendering.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'remove'], description: 'What to do.' },
        track_id: { type: 'string', description: 'Target track id, e.g. A1.' },
        kind: { type: 'string', enum: [...TRACK_KINDS], description: 'Filter for list.' },
        scene_id: { type: 'string', description: 'Filter for list.' },
        shot_id: { type: 'string', description: 'Filter for list.' },
        track: TRACK_ADD_INPUT,
        patch: TRACK_UPDATE_INPUT,
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => audioRender(value) },
    async execute(args, exec) {
      const action = args.action
      const { cwd, production } = await load(exec)
      const audio = requireFile(production, FILE_NAMES.audio, 'audio')
      const storyboard = production.storyboard

      if (action === 'list') {
        let tracks = audio.tracks
        if (typeof args.kind === 'string' && args.kind !== '') {
          tracks = tracks.filter(track => track.kind === args.kind)
        }
        if (typeof args.scene_id === 'string' && args.scene_id !== '') {
          tracks = tracks.filter(track => track.sceneId === args.scene_id)
        }
        if (typeof args.shot_id === 'string' && args.shot_id !== '') {
          tracks = tracks.filter(track => track.shotIds.includes(args.shot_id))
        }
        return result('list', production, { tracks })
      }

      if (action === 'add') {
        if (args.track === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'track is required')
        const next = addTrack(audio, args.track, { storyboard: storyboard ?? undefined })
        await save(exec, cwd, production, FILE_NAMES.audio, next)
        return result('add', { ...production, audio: next }, { track: next.tracks[next.tracks.length - 1] })
      }

      if (typeof args.track_id !== 'string' || args.track_id === '') {
        throw new VideoError('VIDEO_INVALID_INPUT', 'track_id is required')
      }

      if (action === 'update') {
        if (args.patch === undefined) throw new VideoError('VIDEO_INVALID_INPUT', 'patch is required')
        const next = updateTrack(audio, args.track_id, args.patch, { storyboard: storyboard ?? undefined })
        await save(exec, cwd, production, FILE_NAMES.audio, next)
        return result('update', { ...production, audio: next }, {
          track: next.tracks.find(track => track.id === args.track_id),
        })
      }

      if (action === 'remove') {
        const next = removeTrack(audio, args.track_id, {})
        await save(exec, cwd, production, FILE_NAMES.audio, next)
        return result('remove', { ...production, audio: next }, { track: { id: args.track_id } })
      }

      throw new VideoError('VIDEO_INVALID_INPUT', `unknown action "${String(action)}"`)
    },
  }

  const promptTool = {
    name: 'video_prompt',
    description:
      'Assemble the paste-ready prompt for one shot, one scene or the whole film: positive prompt, negative prompt and parameters kept apart, exactly as a generation platform wants them. Use it to hand prompts to the user, to check completeness before saying a shot is ready, or to produce the prompt sheet. It never generates video.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['scope'],
      properties: {
        scope: {
          type: 'string',
          enum: ['shot', 'scene', 'all'],
          description: 'One shot, one scene, or the whole production.',
        },
        shot_id: { type: 'string', description: 'Required when scope is shot.' },
        scene_id: { type: 'string', description: 'Required when scope is scene.' },
        language: {
          type: 'string',
          enum: ['zh', 'en'],
          description: 'Label language for the Markdown sheet; defaults to the production language.',
        },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value.render ?? value.combined ?? 'ok') },
    async execute(args, exec) {
      const { production } = await load(exec)
      const storyboard = requireFile(production, FILE_NAMES.storyboard, 'storyboard')
      const project = production.project
      const language =
        args.language === 'zh' || args.language === 'en'
          ? args.language
          : project?.language === 'en'
            ? 'en'
            : 'zh'

      const enrich = entries =>
        entries.map(({ scene, shot }) => {
          const enriched = { ...shot, sceneId: scene.id }
          const fields = promptFields(enriched, project)
          return {
            shotId: shot.id,
            sceneId: scene.id,
            product: fields.product,
            text: fields.text,
            negative: fields.negative,
            params: fields.params,
            paramsLine: paramLine(fields, 'en'),
            block: promptBlock(enriched, project, { language, headingLevel: 3 }),
          }
        })

      if (args.scope === 'shot') {
        if (typeof args.shot_id !== 'string' || args.shot_id === '') {
          throw new VideoError('VIDEO_INVALID_INPUT', 'shot_id is required when scope is shot')
        }
        const found = findShot(storyboard, args.shot_id)
        const [entry] = enrich([found])
        const combined = clipCombined(entry.block, 20000)
        return result('shot', production, {
          scope: 'shot',
          shots: [entry],
          combined: combined.text,
          truncated: combined.truncated,
          render: entry.block,
        })
      }

      if (args.scope === 'scene') {
        if (typeof args.scene_id !== 'string' || args.scene_id === '') {
          throw new VideoError('VIDEO_INVALID_INPUT', 'scene_id is required when scope is scene')
        }
        const scene = storyboard.scenes.find(entry => entry.id === args.scene_id)
        if (scene === undefined) {
          throw new VideoError('VIDEO_NOT_FOUND', `no scene "${args.scene_id}"`)
        }
        const entries = enrich(listShots({ ...storyboard, scenes: [scene] }))
        const sheet = clipCombined(
          promptSheet({ project, storyboard: { ...storyboard, scenes: [scene] }, language }),
          20000,
        )
        return result('scene', production, {
          scope: 'scene',
          sceneId: scene.id,
          shots: entries,
          combined: sheet.text,
          truncated: sheet.truncated,
          render: sheet.text,
        })
      }

      if (args.scope === 'all') {
        const entries = enrich(listShots(storyboard))
        const sheet = clipCombined(promptSheet({ project, storyboard, language }), 20000)
        return result('all', production, {
          scope: 'all',
          shots: entries,
          combined: sheet.text,
          truncated: sheet.truncated,
          render: sheet.text,
        })
      }

      throw new VideoError('VIDEO_INVALID_INPUT', `unknown scope "${String(args.scope)}"`)
    },
  }

  const reviewTool = {
    name: 'video_review',
    description:
      'Run the deterministic production review: missing prompts or actions, duration drift against the target, shots with takes but no selection, dialogue without voice-over, prompts whose negative text sits inside the positive prompt, referenced files that do not exist, and more. Read-only. Run it before handing work back, and after each round of changes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scene_id: { type: 'string', description: 'Limit storyboard findings to one scene.' },
        include_info: { type: 'boolean', description: 'Include informational findings (shot size, movement, sfx).' },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => textBlock(value.render ?? 'ok') },
    async execute(args, exec) {
      const { cwd, production } = await load(exec)
      const exists = relativePath =>
        fileExists({
          fs: ctx.fs,
          cwd,
          rootDir: production.paths.rootDir,
          relativePath,
          signal: exec.signal,
        })
      const review = await reviewProduction({
        project: production.project,
        storyboard: production.storyboard,
        audio: production.audio,
        errors: production.errors,
        exists,
        limits,
        includeInfo: args.include_info === true,
      })
      let findings = review.findings
      if (typeof args.scene_id === 'string' && args.scene_id !== '') {
        const scene = (production.storyboard?.scenes ?? []).find(entry => entry.id === args.scene_id)
        if (scene === undefined) {
          throw new VideoError('VIDEO_NOT_FOUND', `no scene "${args.scene_id}"`)
        }
        const ids = scene.shots.map(shot => shot.id)
        findings = findings.filter(
          item =>
            item.path.startsWith(FILE_NAMES.project) ||
            item.path.startsWith(FILE_NAMES.audio) ||
            ids.some(id => item.path.includes(`:${id}`)),
        )
      }
      const errors = findings.filter(item => item.severity === 'error').length
      const warnings = findings.filter(item => item.severity === 'warning').length
      const infos = findings.filter(item => item.severity === 'info').length
      const header = summaryLine(review.summary)
      const findingLines = findings
        .slice(0, 12)
        .map(item => `[${item.severity}] ${item.code} ${item.path}: ${clip(item.message, 220)}`)
      const render = linesOf([
        header,
        `${errors} error(s) · ${warnings} warning(s) · ${infos} info(s)`,
        ...findingLines,
        findings.length > findingLines.length ? `… ${findings.length - findingLines.length} more finding(s)` : '',
        review.next.length > 0 ? `next: ${review.next.join(' | ')}` : '',
      ])
      return {
        ok: true,
        action: 'review',
        path: production.paths.rootDir,
        summary: review.summary,
        findings,
        truncated: review.truncated,
        next: review.next,
        counts: { error: errors, warning: warnings, info: infos },
        render,
      }
    },
  }

  return [projectTool, storyboardTool, takeTool, audioTool, promptTool, reviewTool]
}

/** Truncate the combined sheet while saying so. */
function clipCombined(value, max) {
  const text = typeof value === 'string' ? value : ''
  if (text.length <= max) return { text, truncated: false }
  return {
    text: `${text.slice(0, max)}\n\n… truncated; request one scene at a time for the rest.`,
    truncated: true,
  }
}
