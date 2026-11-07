import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_LIMITS,
  VideoError,
  addScene,
  addShot,
  addTake,
  addTrack,
  applyProjectFields,
  createEmptyAudio,
  createEmptyStoryboard,
  createProject,
  listShots,
  normalizeProject,
  normalizeRelativePath,
  parseProjectText,
  removeScene,
  removeShot,
  removeTake,
  reviewProduction,
  selectTake,
  summarize,
  updateScene,
  updateShot,
  updateTrack,
} from '../production.js'

const clock = () => '2026-01-01T00:00:00.000Z'

function project() {
  return createProject(
    {
      title: '夜班',
      logline: '夜班保安发现监控里多了一个自己。',
      aspect: '9:16',
      target_duration_sec: 40,
      products: ['可灵'],
      characters: [{ id: 'guard', name: '老周', look: '40 岁，寸头，深蓝制服' }],
    },
    { now: clock },
  )
}

function storyboard() {
  let board = createEmptyStoryboard(clock)
  board = addScene(board, { title: '监控室', purpose: 'hook' }, { now: clock })
  board = addShot(
    board,
    'S1',
    {
      duration_sec: 4,
      shot_size: '中景',
      movement: '缓推',
      subject: '老周',
      action: '盯着屏幕，身体前倾',
      prompt: {
        text: '凌晨监控室，保安坐在操作台前，冷光，缓推',
        negative: '水印',
        product: '可灵',
        params: { duration: '4s', aspect: '9:16' },
      },
      continuity: { characters: ['guard'] },
    },
    { now: clock },
  )
  return board
}

test('createProject fills defaults and keeps provided fields', () => {
  const created = createProject({ title: '夜班' }, { now: clock })
  assert.equal(created.schemaVersion, 1)
  assert.equal(created.title, '夜班')
  assert.equal(created.aspect, '9:16')
  assert.equal(created.targetDurationSec, 0)
  assert.deepEqual(created.products, [])
  assert.equal(created.createdAt, clock())
  assert.equal(created.updatedAt, clock())
})

test('createProject uses the configured default aspect', () => {
  const created = createProject({}, { now: clock, aspect: '16:9' })
  assert.equal(created.aspect, '16:9')
})

test('applyProjectFields merges and rejects unknown fields', () => {
  const updated = applyProjectFields(project(), { tone: '冷、克制', target_duration_sec: 30 }, { now: clock })
  assert.equal(updated.tone, '冷、克制')
  assert.equal(updated.targetDurationSec, 30)
  assert.throws(() => applyProjectFields(project(), { nope: 1 }), /unknown field/)
  assert.throws(() => applyProjectFields(project(), { aspect: '2:1' }), /aspect must be one of/)
})

test('project parsing requires schemaVersion 1 and valid JSON', () => {
  const text = JSON.stringify({ ...project(), schemaVersion: 2 })
  assert.throws(() => parseProjectText(text), error => error.code === 'VIDEO_BAD_SCHEMA')
  assert.throws(() => parseProjectText('{'), error => error.code === 'VIDEO_BAD_JSON')
})

test('normalizeProject rejects duplicate character ids', () => {
  const raw = { ...project(), characters: [{ id: 'guard' }, { id: 'guard' }] }
  assert.throws(() => normalizeProject(raw), error => error.code === 'VIDEO_DUPLICATE_ID')
})

test('normalizeRelativePath rejects absolute and escaping paths', () => {
  assert.equal(normalizeRelativePath('assets/takes/t1.mp4'), 'assets/takes/t1.mp4')
  assert.equal(normalizeRelativePath('assets\\takes\\t1.mp4'), 'assets/takes/t1.mp4')
  assert.equal(normalizeRelativePath('/abs/path.png'), null)
  assert.equal(normalizeRelativePath('../outside.png'), null)
  assert.equal(normalizeRelativePath('assets//t1.png'), null)
  assert.equal(normalizeRelativePath('C:/x.png'), null)
})

test('scenes and shots get stable, sequential ids', () => {
  let board = createEmptyStoryboard(clock)
  board = addScene(board, { title: 'A', purpose: 'hook' }, { now: clock })
  board = addScene(board, { title: 'B', purpose: 'turn' }, { now: clock })
  board = addShot(board, 'S1', { duration_sec: 3 }, { now: clock })
  board = addShot(board, 'S1', { duration_sec: 3 }, { now: clock })
  assert.deepEqual(
    board.scenes.map(scene => scene.id),
    ['S1', 'S2'],
  )
  assert.deepEqual(
    board.scenes[0].shots.map(shot => shot.id),
    ['S1-01', 'S1-02'],
  )
})

test('addShot requires a duration inside the configured range', () => {
  const board = storyboard()
  assert.throws(() => addShot(board, 'S1', {}, { now: clock }), /duration_sec is required/)
  assert.throws(() => addShot(board, 'S1', { duration_sec: 20 }, { now: clock }), /duration_sec must be <= 10/)
})

test('addShot honours maxShotsPerScene', () => {
  const board = storyboard()
  let current = board
  for (let index = 1; index < DEFAULT_LIMITS.maxShotsPerScene; index += 1) {
    current = addShot(current, 'S1', { duration_sec: 2 }, { now: clock })
  }
  assert.throws(
    () => addShot(current, 'S1', { duration_sec: 2 }, { now: clock }),
    error => error.code === 'VIDEO_LIMIT',
  )
})

test('updateShot merges nested objects instead of resetting them', () => {
  const board = storyboard()
  const updated = updateShot(
    board,
    'S1-01',
    { prompt: { text: '新提示词' }, status: 'prompt_ready' },
    { now: clock },
  )
  const shot = updated.scenes[0].shots[0]
  assert.equal(shot.prompt.text, '新提示词')
  assert.equal(shot.prompt.negative, '水印')
  assert.equal(shot.prompt.product, '可灵')
  assert.equal(shot.prompt.params.aspect, '9:16')
  assert.equal(shot.status, 'prompt_ready')
})

test('updateShot rejects unknown fields and escaping paths', () => {
  const board = storyboard()
  assert.throws(() => updateShot(board, 'S1-01', { nope: 1 }, { now: clock }), /unknown field/)
  assert.throws(
    () => updateShot(board, 'S1-01', { prompt: { params: { references: ['../x.png'] } } }, { now: clock }),
    error => error.code === 'VIDEO_PATH_ESCAPE',
  )
})

test('take lifecycle advances status and selection', () => {
  let board = storyboard()
  board = addTake(board, 'S1-01', { file: 'assets/takes/S1-01/t1.mp4', rating: 4, notes: '冷光偏亮' }, { now: clock })
  assert.equal(board.scenes[0].shots[0].status, 'generated')
  assert.equal(board.scenes[0].shots[0].takes[0].id, 't1')
  board = addTake(board, 'S1-01', { file: 'assets/takes/S1-01/t2.mp4' }, { now: clock })
  board = selectTake(board, 'S1-01', 't2', { now: clock })
  const shot = board.scenes[0].shots[0]
  assert.equal(shot.status, 'selected')
  assert.deepEqual(
    shot.takes.map(take => take.selected),
    [false, true],
  )
  board = removeTake(board, 'S1-01', 't2', { now: clock })
  assert.equal(board.scenes[0].shots[0].status, 'generated')
})

test('take paths must stay inside the production', () => {
  const board = storyboard()
  assert.throws(
    () => addTake(board, 'S1-01', { file: '/tmp/x.mp4' }, { now: clock }),
    error => error.code === 'VIDEO_PATH_ESCAPE',
  )
})

test('removing a scene or shot with takes needs force', () => {
  let board = storyboard()
  assert.throws(() => removeScene(board, 'S1', { now: clock }), error => error.code === 'VIDEO_HAS_TAKES')
  board = addTake(board, 'S1-01', {}, { now: clock })
  assert.throws(() => removeShot(board, 'S1-01', { now: clock }), error => error.code === 'VIDEO_HAS_TAKES')
  assert.equal(removeShot(board, 'S1-01', { force: true, now: clock }).scenes[0].shots.length, 0)
})

test('audio tracks validate kind and targets, and update partially', () => {
  let audio = createEmptyAudio(clock)
  assert.throws(() => addTrack(audio, { text: 'x' }, { now: clock }), /kind is required/)
  assert.throws(() => addTrack(audio, { kind: 'vo' }, { now: clock }), /needs scene_id or shot_ids/)
  audio = addTrack(
    audio,
    { kind: 'vo', shot_ids: ['S1-01'], text: '凌晨三点，监控里多了一个人。', duration_sec: 4 },
    { now: clock },
  )
  assert.equal(audio.tracks[0].id, 'A1')
  audio = updateTrack(audio, 'A1', { notes: '压低' }, { now: clock })
  assert.equal(audio.tracks[0].kind, 'vo')
  assert.equal(audio.tracks[0].notes, '压低')
  assert.throws(
    () => updateTrack(audio, 'A1', { shot_ids: ['S9-99'] }, { storyboard: storyboard(), now: clock }),
    error => error.code === 'VIDEO_NOT_FOUND',
  )
  assert.throws(
    () => updateTrack(audio, 'A1', { scene_id: 'S9' }, { storyboard: storyboard(), now: clock }),
    error => error.code === 'VIDEO_NOT_FOUND',
  )
})

test('summarize counts shots, durations and takes', () => {
  let board = storyboard()
  board = addTake(board, 'S1-01', { file: 'assets/takes/S1-01/t1.mp4' }, { now: clock })
  board = selectTake(board, 'S1-01', 't1', { now: clock })
  const summary = summarize(project(), board, createEmptyAudio(clock))
  assert.equal(summary.scenes, 1)
  assert.equal(summary.shots, 1)
  assert.equal(summary.plannedSeconds, 4)
  assert.equal(summary.targetSeconds, 40)
  assert.equal(summary.takes, 1)
  assert.equal(summary.selected, 1)
  assert.equal(summary.statusCounts.selected, 1)
})

test('review reports the structural and creative gaps', async () => {
  let board = createEmptyStoryboard(clock)
  board = addScene(board, { title: '开场' }, { now: clock })
  board = addShot(
    board,
    'S1',
    {
      duration_sec: 4,
      prompt: { text: '负向：水印', product: '可灵', params: {} },
      dialogue: '有人吗？',
    },
    { now: clock },
  )
  const review = await reviewProduction({
    project: { ...project(), targetDurationSec: 10 },
    storyboard: board,
    audio: createEmptyAudio(clock),
    errors: {},
    limits: DEFAULT_LIMITS,
  })
  const codes = review.findings.map(item => item.code)
  assert.ok(codes.includes('SHOT_MISSING_ACTION'), 'missing action is reported')
  assert.ok(codes.includes('SCENE_PURPOSE_MISSING'), 'missing purpose is reported')
  assert.ok(codes.includes('PROMPT_CONTAINS_NEGATIVE_LABEL'), 'negative label in text is reported')
  assert.ok(codes.includes('MISSING_ASPECT_IN_PARAMS'), 'missing aspect is reported')
  assert.ok(codes.includes('MISSING_VO_FOR_DIALOGUE'), 'dialogue without VO is reported')
  assert.ok(codes.includes('NO_MUSIC'), 'missing music is reported')
  assert.ok(codes.includes('DURATION_DRIFT'), 'duration drift is reported')
  assert.ok(review.findings.every(item => typeof item.fix === 'string' && item.fix !== ''))
  assert.ok(review.next.length > 0 && review.next.length <= 3)
})

test('review reports generated shots without takes and multiple selections', async () => {
  let board = storyboard()
  board = addTake(board, 'S1-01', { file: 'assets/takes/S1-01/t1.mp4' }, { now: clock })
  const broken = {
    ...board,
    scenes: [
      {
        ...board.scenes[0],
        shots: [
          {
            ...board.scenes[0].shots[0],
            status: 'selected',
            takes: [
              { ...board.scenes[0].shots[0].takes[0], selected: true },
              { ...board.scenes[0].shots[0].takes[0], id: 't2', selected: true },
            ],
          },
        ],
      },
    ],
  }
  const review = await reviewProduction({
    project: project(),
    storyboard: broken,
    audio: createEmptyAudio(clock),
  })
  const codes = review.findings.map(item => item.code)
  assert.ok(codes.includes('MULTIPLE_SELECTED_TAKES'))
})

test('review checks referenced files through the injected exists callback', async () => {
  const board = storyboard()
  const shot = board.scenes[0].shots[0]
  const review = await reviewProduction({
    project: project(),
    storyboard: {
      ...board,
      scenes: [
        {
          ...board.scenes[0],
          shots: [
            {
              ...shot,
              prompt: {
                ...shot.prompt,
                params: { ...shot.prompt.params, references: ['assets/ref/guard.png'] },
              },
            },
          ],
        },
      ],
    },
    audio: createEmptyAudio(clock),
    exists: () => false,
  })
  const codes = review.findings.map(item => item.code)
  assert.ok(codes.includes('REFERENCE_FILE_MISSING'), 'missing reference file is reported')
})

test('review surfaces a file that failed to parse', async () => {
  const review = await reviewProduction({
    project: null,
    storyboard: null,
    audio: null,
    errors: { 'project.json': 'project.json is not valid JSON' },
  })
  assert.ok(review.findings.some(item => item.code === 'UNREADABLE_FILE'))
  assert.ok(review.next[0].includes('Fix the JSON'))
})

test('updating a scene keeps its shots', () => {
  const board = storyboard()
  const updated = updateScene(board, 'S1', { purpose: 'turn', location: '监控室' }, { now: clock })
  assert.equal(updated.scenes[0].purpose, 'turn')
  assert.equal(updated.scenes[0].shots.length, 1)
  assert.throws(() => updateScene(board, 'S9', { title: 'x' }, { now: clock }), /no scene/)
})

test('listShots exposes every shot with its scene', () => {
  const entries = listShots(storyboard())
  assert.equal(entries.length, 1)
  assert.equal(entries[0].scene.id, 'S1')
  assert.equal(entries[0].shot.id, 'S1-01')
})

test('VideoError carries a stable code', () => {
  const error = new VideoError('VIDEO_LIMIT', 'too many')
  assert.equal(error.name, 'VideoError')
  assert.equal(error.code, 'VIDEO_LIMIT')
  assert.match(error.message, /too many/)
})
