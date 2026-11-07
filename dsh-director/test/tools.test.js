import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFakeFs, createFakePluginContext } from './fake-fs.js'
import { createTools } from '../tools.js'

const config = {
  root: 'video',
  guidance: true,
  skill: true,
  defaultAspect: '9:16',
  maxScenes: 40,
  maxShotsPerScene: 60,
  maxTakesPerShot: 20,
  maxPromptChars: 2000,
  minShotSeconds: 1,
  maxShotSeconds: 10,
  durationTolerance: 0.15,
}

function setup() {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  const tools = createTools({ ctx: fake.ctx, config })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  const exec = { agent: { id: 'agent-1' } }
  return { fs, fake, tools, byName, exec }
}

const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const SCHEMA_KEYWORDS = new Set([
  'type',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'description',
  'title',
  'default',
  'examples',
])

function walkSchema(node, path, problems) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    problems.push(`${path} must be an object`)
    return
  }
  for (const key of Object.keys(node)) {
    if (!SCHEMA_KEYWORDS.has(key)) problems.push(`${path}.${key} is not supported`)
  }
  if (node.type !== undefined && !SCHEMA_TYPES.has(node.type)) problems.push(`${path}.type "${node.type}" is not supported`)
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    walkSchema(child, `${path}.properties.${key}`, problems)
  }
  if (node.items !== undefined) walkSchema(node.items, `${path}.items`, problems)
  for (const [index, child] of (node.oneOf ?? []).entries()) walkSchema(child, `${path}.oneOf[${index}]`, problems)
}

test('every tool is registered with a supported JSON Schema', () => {
  const { tools } = setup()
  assert.deepEqual(
    tools.map(tool => tool.name),
    ['video_project', 'video_storyboard', 'video_take', 'video_audio', 'video_prompt', 'video_review'],
  )
  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 80, `${tool.name} has a useful description`)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    assert.equal(typeof tool.output.render, 'function')
    const problems = []
    walkSchema(tool.parameters, `${tool.name}.parameters`, problems)
    walkSchema(tool.output.schema, `${tool.name}.output`, problems)
    assert.deepEqual(problems, [], `${tool.name} schema problems`)
  }
})

test('project init creates the production and read reports it', async () => {
  const { byName, exec, fs } = setup()
  const init = await byName.video_project.execute(
    {
      action: 'init',
      title: '夜班',
      logline: '夜班保安发现监控里多了一个自己。',
      target_duration_sec: 40,
      products: ['可灵'],
    },
    exec,
  )
  assert.equal(init.ok, true)
  assert.equal(init.project.title, '夜班')
  assert.equal(init.summary.shots, 0)
  assert.ok(fs.get('/workspace/video/project.json'))
  assert.ok(fs.get('/workspace/video/storyboard.json'))
  assert.ok(fs.get('/workspace/video/audio.json'))
  assert.match(byName.video_project.output.render({}, init)[0].text, /夜班/)

  const read = await byName.video_project.execute({ action: 'read' }, exec)
  assert.equal(read.project.title, '夜班')
  assert.equal(read.missing, false)
  assert.match(byName.video_project.output.render({}, read)[0].text, /0 scene\(s\)/)
})

test('project read before init is an empty answer, not an error', async () => {
  const { byName, exec } = setup()
  const read = await byName.video_project.execute({ action: 'read' }, exec)
  assert.equal(read.project, null)
  assert.equal(read.missing, true)
  assert.match(byName.video_project.output.render({}, read)[0].text, /no production yet/)
})

test('project update merges fields and rejects unknown ones', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute({ action: 'init', title: '夜班' }, exec)
  const updated = await byName.video_project.execute(
    { action: 'update', tone: '冷、克制', products: ['可灵', '即梦'] },
    exec,
  )
  assert.equal(updated.project.tone, '冷、克制')
  assert.deepEqual(updated.project.products, ['可灵', '即梦'])
  await assert.rejects(
    () => byName.video_project.execute({ action: 'update', maker: 'x' }, exec),
    /unknown field/,
  )
})

test('storyboard flow creates ids, prompts and takes', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute({ action: 'init', title: '夜班', products: ['可灵'] }, exec)
  const scene = await byName.video_storyboard.execute(
    { action: 'add_scene', scene: { title: '监控室', purpose: 'hook' } },
    exec,
  )
  assert.equal(scene.scene.id, 'S1')
  const shot = await byName.video_storyboard.execute(
    {
      action: 'add_shot',
      scene_id: 'S1',
      shot: {
        duration_sec: 4,
        shot_size: '中景',
        movement: '缓推',
        subject: '老周',
        action: '盯着屏幕',
        prompt: {
          text: '凌晨监控室，保安坐在操作台前',
          negative: '水印',
          product: '可灵',
          params: { duration: '4s', aspect: '9:16' },
        },
      },
    },
    exec,
  )
  assert.equal(shot.shot.id, 'S1-01')

  const updated = await byName.video_storyboard.execute(
    { action: 'update_shot', shot_id: 'S1-01', patch: { status: 'prompt_ready', prompt: { text: '新提示词' } } },
    exec,
  )
  assert.equal(updated.shot.status, 'prompt_ready')
  assert.equal(updated.shot.prompt.text, '新提示词')
  assert.equal(updated.shot.prompt.negative, '水印')

  const list = await byName.video_storyboard.execute({ action: 'list' }, exec)
  assert.equal(list.entries.length, 1)
  assert.match(byName.video_storyboard.output.render({}, list)[0].text, /S1-01 4s \[prompt_ready\]/)

  const taken = await byName.video_take.execute(
    { action: 'add', shot_id: 'S1-01', take: { file: 'assets/takes/S1-01/t1.mp4', rating: 4 } },
    exec,
  )
  assert.equal(taken.shot.status, 'generated')
  assert.equal(taken.take.id, 't1')
  const selected = await byName.video_take.execute(
    { action: 'select', shot_id: 'S1-01', take_id: 't1' },
    exec,
  )
  assert.equal(selected.shot.status, 'selected')
  assert.equal(selected.shot.takes[0].selected, true)
  assert.match(byName.video_take.output.render({}, selected)[0].text, /t1\*/)
})

test('audio plan lists and updates cues', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute({ action: 'init', title: '夜班' }, exec)
  await byName.video_storyboard.execute(
    { action: 'add_scene', scene: { title: '监控室', purpose: 'hook' } },
    exec,
  )
  await byName.video_storyboard.execute(
    { action: 'add_shot', scene_id: 'S1', shot: { duration_sec: 4, action: '盯着屏幕' } },
    exec,
  )
  const added = await byName.video_audio.execute(
    { action: 'add', track: { kind: 'vo', shot_ids: ['S1-01'], text: '凌晨三点。', duration_sec: 4 } },
    exec,
  )
  assert.equal(added.track.id, 'A1')
  const updated = await byName.video_audio.execute(
    { action: 'update', track_id: 'A1', patch: { notes: '压低' } },
    exec,
  )
  assert.equal(updated.track.kind, 'vo')
  assert.equal(updated.track.notes, '压低')
  const list = await byName.video_audio.execute({ action: 'list', kind: 'vo' }, exec)
  assert.equal(list.tracks.length, 1)
  assert.match(byName.video_audio.output.render({}, list)[0].text, /A1 vo → S1-01/)
  await assert.rejects(
    () => byName.video_audio.execute({ action: 'add', track: { kind: 'vo' } }, exec),
    /needs scene_id or shot_ids/,
  )
})

test('video_prompt hands back the three paste-ready pieces', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute(
    { action: 'init', title: '夜班', aspect: '9:16', products: ['可灵'] },
    exec,
  )
  await byName.video_storyboard.execute(
    { action: 'add_scene', scene: { title: '监控室', purpose: 'hook' } },
    exec,
  )
  await byName.video_storyboard.execute(
    {
      action: 'add_shot',
      scene_id: 'S1',
      shot: {
        duration_sec: 4,
        action: '盯着屏幕',
        prompt: {
          text: '凌晨监控室，保安坐在操作台前',
          negative: '水印',
          product: '可灵',
          params: { duration: '5s', aspect: '9:16', references: ['assets/ref/guard.png'] },
        },
      },
    },
    exec,
  )
  const shotPrompt = await byName.video_prompt.execute({ scope: 'shot', shot_id: 'S1-01' }, exec)
  assert.equal(shotPrompt.shots[0].text, '凌晨监控室，保安坐在操作台前')
  assert.equal(shotPrompt.shots[0].negative, '水印')
  assert.equal(shotPrompt.shots[0].params.duration, '5s')
  assert.equal(shotPrompt.shots[0].params.aspect, '9:16')
  assert.deepEqual(shotPrompt.shots[0].params.references, ['assets/ref/guard.png'])
  assert.match(shotPrompt.combined, /\*\*正向提示词\*\*/)
  assert.match(byName.video_prompt.output.render({}, shotPrompt)[0].text, /S1-01/)

  const scenePrompt = await byName.video_prompt.execute({ scope: 'scene', scene_id: 'S1' }, exec)
  assert.equal(scenePrompt.shots.length, 1)
  assert.match(scenePrompt.combined, /## S1 监控室/)

  const allPrompt = await byName.video_prompt.execute({ scope: 'all' }, exec)
  assert.match(allPrompt.combined, /# 夜班 — 提示词清单/)
  assert.equal(allPrompt.truncated, false)
})

test('video_review reports gaps and passes on a clean production', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute({ action: 'init', title: '夜班' }, exec)
  await byName.video_storyboard.execute(
    { action: 'add_scene', scene: { title: '监控室', purpose: 'hook' } },
    exec,
  )
  await byName.video_storyboard.execute(
    { action: 'add_shot', scene_id: 'S1', shot: { duration_sec: 4 } },
    exec,
  )
  const review = await byName.video_review.execute({}, exec)
  assert.equal(review.counts.error > 0, true)
  assert.ok(review.findings.some(finding => finding.code === 'SHOT_MISSING_ACTION'))
  assert.ok(review.next.length > 0)
  assert.match(byName.video_review.output.render({}, review)[0].text, /error\(s\)/)
})

test('mutations refuse a missing production and unknown actions', async () => {
  const { byName, exec } = setup()
  await assert.rejects(
    () => byName.video_storyboard.execute({ action: 'add_scene', scene: {} }, exec),
    error => error.code === 'VIDEO_PROJECT_MISSING',
  )
  await assert.rejects(
    () => byName.video_prompt.execute({ scope: 'all' }, exec),
    error => error.code === 'VIDEO_PROJECT_MISSING',
  )
  await byName.video_project.execute({ action: 'init' }, exec)
  await assert.rejects(
    () => byName.video_storyboard.execute({ action: 'nope' }, exec),
    /unknown action/,
  )
})

test('removing a scene with shots needs force through the tool too', async () => {
  const { byName, exec } = setup()
  await byName.video_project.execute({ action: 'init' }, exec)
  await byName.video_storyboard.execute({ action: 'add_scene', scene: {} }, exec)
  await byName.video_storyboard.execute({ action: 'add_shot', scene_id: 'S1', shot: { duration_sec: 3 } }, exec)
  await assert.rejects(
    () => byName.video_storyboard.execute({ action: 'remove_scene', scene_id: 'S1' }, exec),
    error => error.code === 'VIDEO_HAS_TAKES',
  )
  const removed = await byName.video_storyboard.execute(
    { action: 'remove_scene', scene_id: 'S1', force: true },
    exec,
  )
  assert.equal(removed.summary.scenes, 0)
})

test('a tool call outside an agent is refused clearly', async () => {
  const { byName } = setup()
  await assert.rejects(
    () => byName.video_project.execute({ action: 'read' }, {}),
    error => error.code === 'VIDEO_NO_AGENT',
  )
})

test('a finished production reviews with zero errors', async () => {
  const { byName, exec, fs } = setup()
  await byName.video_project.execute(
    {
      action: 'init',
      title: '夜班',
      logline: '夜班保安发现监控里多了一个自己。',
      aspect: '9:16',
      target_duration_sec: 4,
      products: ['可灵'],
      characters: [{ id: 'guard', name: '老周', look: '40 岁，寸头，深蓝制服' }],
    },
    exec,
  )
  await byName.video_storyboard.execute(
    { action: 'add_scene', scene: { title: '监控室', purpose: 'hook' } },
    exec,
  )
  await byName.video_storyboard.execute(
    {
      action: 'add_shot',
      scene_id: 'S1',
      shot: {
        duration_sec: 4,
        action: '盯着屏幕',
        status: 'prompt_ready',
        prompt: {
          text: '凌晨监控室，保安坐在操作台前',
          negative: '水印',
          product: '可灵',
          params: { duration: '4s', aspect: '9:16', references: ['assets/ref/guard.png'] },
        },
        continuity: { characters: ['guard'] },
      },
    },
    exec,
  )
  await byName.video_take.execute(
    { action: 'add', shot_id: 'S1-01', take: { file: 'assets/takes/S1-01/t1.mp4', rating: 4 } },
    exec,
  )
  await byName.video_take.execute({ action: 'select', shot_id: 'S1-01', take_id: 't1' }, exec)
  await byName.video_audio.execute(
    { action: 'add', track: { kind: 'vo', shot_ids: ['S1-01'], text: '凌晨三点。', duration_sec: 4 } },
    exec,
  )
  await byName.video_audio.execute(
    { action: 'add', track: { kind: 'music', scene_id: 'S1', duration_sec: 4 } },
    exec,
  )
  fs.seed('/workspace/video/assets/ref/guard.png', 'png')
  fs.seed('/workspace/video/assets/takes/S1-01/t1.mp4', 'mp4')
  const review = await byName.video_review.execute({}, exec)
  assert.equal(review.counts.error, 0, JSON.stringify(review.findings, null, 2))
  assert.match(review.next[0], /Review passes|Finish the audio plan/)
})
