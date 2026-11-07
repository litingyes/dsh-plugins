import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFakeFs } from './fake-fs.js'
import {
  fileExists,
  initProduction,
  loadProduction,
  productionPaths,
  saveFile,
} from '../store.js'
import { createEmptyAudio, createEmptyStoryboard, createProject } from '../production.js'

const cwd = '/workspace'
const root = 'video'
const clock = () => '2026-01-01T00:00:00.000Z'

function project() {
  return createProject({ title: '夜班' }, { now: clock })
}

test('productionPaths keeps the production inside the Session cwd', () => {
  const paths = productionPaths(cwd, root)
  assert.equal(paths.rootDir, '/workspace/video')
  assert.equal(paths.files['project.json'], '/workspace/video/project.json')
  // The config layer rejects `..`, but productionPaths re-checks runtime input.
  assert.throws(() => productionPaths(cwd, '../outside'), error => error.code === 'VIDEO_PATH_ESCAPE')
  assert.throws(() => productionPaths(cwd, '/abs'), error => error.code === 'VIDEO_PATH_ESCAPE')
})

test('initProduction creates the three files with a create guard', async () => {
  const fs = createFakeFs()
  const created = await initProduction({
    fs,
    cwd,
    root,
    project: project(),
    storyboard: createEmptyStoryboard(clock),
    audio: createEmptyAudio(clock),
  })
  assert.equal(fs.files.size, 3)
  assert.ok(fs.get('/workspace/video/project.json'))
  assert.ok(fs.get('/workspace/video/storyboard.json'))
  assert.ok(fs.get('/workspace/video/audio.json'))
  assert.equal(Object.keys(created.versions).length, 3)
})

test('initProduction refuses an existing project and keeps a partial directory', async () => {
  const fs = createFakeFs()
  fs.seed('/workspace/video/project.json', '{}')
  await assert.rejects(
    () =>
      initProduction({
        fs,
        cwd,
        root,
        project: project(),
        storyboard: createEmptyStoryboard(clock),
        audio: createEmptyAudio(clock),
      }),
    error => error.code === 'VIDEO_PROJECT_EXISTS',
  )

  const partial = createFakeFs()
  partial.seed('/workspace/video/storyboard.json', JSON.stringify(createEmptyStoryboard(clock)))
  const result = await initProduction({
    fs: partial,
    cwd,
    root,
    project: project(),
    storyboard: createEmptyStoryboard(clock),
    audio: createEmptyAudio(clock),
  })
  assert.equal(Object.keys(result.versions).length, 3)
  assert.equal(partial.get('/workspace/video/storyboard.json').content, JSON.stringify(createEmptyStoryboard(clock)))
})

test('loadProduction records versions and reports unreadable content', async () => {
  const fs = createFakeFs()
  fs.seed('/workspace/video/project.json', JSON.stringify(project()))
  fs.seed('/workspace/video/storyboard.json', '{ broken')
  const loaded = await loadProduction({ fs, cwd, root })
  assert.equal(loaded.project.title, '夜班')
  assert.equal(loaded.storyboard, null)
  assert.ok(loaded.errors['storyboard.json'].includes('not valid JSON'))
  assert.equal(typeof loaded.versions['project.json'], 'string')
  assert.equal(loaded.audio, null)
  assert.equal(loaded.errors['audio.json'], undefined)
})

test('saveFile guards against a stale version', async () => {
  const fs = createFakeFs()
  await initProduction({
    fs,
    cwd,
    root,
    project: project(),
    storyboard: createEmptyStoryboard(clock),
    audio: createEmptyAudio(clock),
  })
  const loaded = await loadProduction({ fs, cwd, root })
  // Simulate an editor changing the file after the agent read it.
  fs.seed('/workspace/video/project.json', JSON.stringify({ ...project(), title: '外部改动' }))
  await assert.rejects(
    () =>
      saveFile({
        fs,
        cwd,
        root,
        file: 'project.json',
        data: { ...loaded.project, title: '智能体改动' },
        version: loaded.versions['project.json'],
      }),
    error => error.code === 'VIDEO_STALE',
  )
})

test('saveFile writes with the version it was read at', async () => {
  const fs = createFakeFs()
  await initProduction({
    fs,
    cwd,
    root,
    project: project(),
    storyboard: createEmptyStoryboard(clock),
    audio: createEmptyAudio(clock),
  })
  const loaded = await loadProduction({ fs, cwd, root })
  const version = await saveFile({
    fs,
    cwd,
    root,
    file: 'project.json',
    data: { ...loaded.project, title: '夜班（改）' },
    version: loaded.versions['project.json'],
  })
  assert.equal(typeof version, 'string')
  assert.equal(JSON.parse(fs.get('/workspace/video/project.json').content).title, '夜班（改）')
})

test('a sandbox denial becomes a model-facing VIDEO_FS error', async () => {
  const fs = createFakeFs()
  const original = fs.writeText
  fs.writeText = async () => {
    const error = new Error('denied')
    error.code = 'FS_SANDBOX_DENIED'
    throw error
  }
  await assert.rejects(
    () =>
      initProduction({
        fs,
        cwd,
        root,
        project: project(),
        storyboard: createEmptyStoryboard(clock),
        audio: createEmptyAudio(clock),
      }),
    error => error.code === 'VIDEO_FS' && /denied/.test(error.message),
  )
  fs.writeText = original
})

test('fileExists resolves project-relative paths only', async () => {
  const fs = createFakeFs()
  fs.seed('/workspace/video/assets/ref/guard.png', 'png')
  const rootDir = '/workspace/video'
  assert.equal(
    await fileExists({ fs, cwd, rootDir, relativePath: 'assets/ref/guard.png' }),
    true,
  )
  assert.equal(await fileExists({ fs, cwd, rootDir, relativePath: 'assets/ref/missing.png' }), false)
  assert.equal(await fileExists({ fs, cwd, rootDir, relativePath: '../outside.png' }), false)
})
