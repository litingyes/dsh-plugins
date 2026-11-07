import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApi } from '../api.js'
import { resolveConfig } from '../index.js'
import { createEmptyAudio, createEmptyStoryboard, createProject } from '../production.js'

const clock = () => '2026-01-01T00:00:00.000Z'

async function makeWorkspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-director-api-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function seed(dir, files) {
  await mkdir(join(dir, 'video'), { recursive: true })
  for (const [name, value] of Object.entries(files)) {
    const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
    await writeFile(join(dir, 'video', name), content, 'utf8')
  }
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(chunk) {
      this.body += chunk ?? ''
    },
  }
}

function handler(options = {}) {
  const config = resolveConfig(options.config ?? {})
  return createApi({
    config,
    authorize: options.authorize,
    workspaces: options.workspaces ?? (() => [{ id: 'w1', title: 'Workspace', path: options.path ?? '/tmp' }]),
  })
}

async function request(fn, url, method = 'GET') {
  const res = createRes()
  await fn({ url, method }, res)
  const contentType = res.headers['content-type'] ?? ''
  const payload =
    res.body === ''
      ? undefined
      : contentType.startsWith('application/json')
        ? JSON.parse(res.body)
        : res.body
  return { status: res.statusCode, headers: res.headers, payload }
}

test('a seeded production comes back with project, storyboard and review', async t => {
  const dir = await makeWorkspace(t)
  await seed(dir, {
    'project.json': createProject({ title: '夜班', target_duration_sec: 40 }, { now: clock }),
    'storyboard.json': createEmptyStoryboard(clock),
    'audio.json': createEmptyAudio(clock),
  })
  const { status, payload, headers } = await request(
    handler({ path: dir }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.equal(status, 200)
  assert.equal(headers['cache-control'], 'no-store')
  assert.equal(payload.ok, true)
  assert.equal(payload.project.title, '夜班')
  assert.equal(payload.missing, false)
  assert.ok(Array.isArray(payload.review.findings))
  assert.equal(payload.root, 'video')
})

test('a workspace without a production is an empty state, not an error', async t => {
  const dir = await makeWorkspace(t)
  const { status, payload } = await request(
    handler({ path: dir }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.equal(status, 200)
  assert.equal(payload.project, null)
  assert.equal(payload.missing, true)
  assert.ok(payload.review.findings.some(finding => finding.code === 'PROJECT_MISSING'))
})

test('an unreadable JSON file is returned as a review error', async t => {
  const dir = await makeWorkspace(t)
  await seed(dir, { 'project.json': '{ broken' })
  const { status, payload } = await request(
    handler({ path: dir }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.equal(status, 200)
  assert.equal(payload.project, null)
  assert.match(payload.errors['project.json'], /not valid JSON/)
  assert.ok(payload.review.findings.some(finding => finding.code === 'UNREADABLE_FILE'))
})

test('missing take files surface as review warnings', async t => {
  const dir = await makeWorkspace(t)
  const project = createProject({ title: '夜班' }, { now: clock })
  const board = {
    schemaVersion: 1,
    updatedAt: clock(),
    scenes: [
      {
        id: 'S1',
        title: '监控室',
        purpose: 'hook',
        summary: '',
        location: '',
        timeOfDay: '',
        shots: [
          {
            id: 'S1-01',
            durationSec: 4,
            shotSize: '',
            angle: '',
            movement: '',
            subject: '',
            action: '盯着屏幕',
            dialogue: '',
            onScreenText: '',
            audio: { vo: '', sfx: [], music: '' },
            prompt: { text: '提示词', negative: '', product: '', params: {} },
            continuity: { characters: [], props: [], notes: '' },
            status: 'generated',
            takes: [
              {
                id: 't1',
                file: 'assets/takes/S1-01/t1.mp4',
                createdAt: clock(),
                rating: 0,
                notes: '',
                selected: true,
              },
            ],
          },
        ],
      },
    ],
  }
  await seed(dir, {
    'project.json': project,
    'storyboard.json': board,
    'audio.json': createEmptyAudio(clock),
  })
  const { payload } = await request(
    handler({ path: dir }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.ok(payload.review.findings.some(finding => finding.code === 'TAKE_FILE_MISSING'))
})

test('the route requires an absolute directory inside a registered workspace', async t => {
  const dir = await makeWorkspace(t)
  const fn = handler({ path: dir })
  assert.equal((await request(fn, '/dsh-director/api/state?dir=relative')).status, 400)
  assert.equal(
    (await request(fn, '/dsh-director/api/state?dir=%2Fdefinitely%2Fmissing%2Fdir')).status,
    400,
  )
  const outside = await request(
    handler({ path: '/some/other/workspace' }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.equal(outside.status, 403)
  assert.equal(outside.payload.error.code, 'outside_workspace')
})

test('no registered workspace and unknown endpoints are refused', async t => {
  const dir = await makeWorkspace(t)
  const none = await request(
    handler({ workspaces: () => [] }),
    `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`,
  )
  assert.equal(none.status, 409)
  assert.equal(none.payload.error.code, 'no_workspace')

  const fn = handler({ path: dir })
  assert.equal((await request(fn, '/dsh-director/api/nope')).status, 404)
  assert.equal((await request(fn, `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`, 'POST')).status, 405)
})

test('authorization fails closed', async t => {
  const dir = await makeWorkspace(t)
  const url = `/dsh-director/api/state?dir=${encodeURIComponent(dir)}`
  assert.equal((await request(handler({ path: dir, authorize: () => 401 }), url)).status, 401)
  assert.equal(
    (
      await request(
        handler({
          path: dir,
          authorize: () => {
            throw new Error('no auth plane')
          },
        }),
        url,
      )
    ).status,
    401,
  )
  assert.equal((await request(handler({ path: dir, authorize: () => undefined }), url)).status, 200)
})

test('a Session directory below a workspace root is accepted', async t => {
  const dir = await makeWorkspace(t)
  const nested = join(dir, 'session')
  await mkdir(join(nested, 'video'), { recursive: true })
  const { status } = await request(
    handler({ path: dir }),
    `/dsh-director/api/state?dir=${encodeURIComponent(nested)}`,
  )
  assert.equal(status, 200)
})
