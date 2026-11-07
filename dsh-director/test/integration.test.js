import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, guidanceText, inject, name } from '../index.js'
import { createFakeFs, createFakePluginContext } from './fake-fs.js'

test('the module exports the cordis plugin contract', () => {
  assert.equal(name, 'dsh-director')
  assert.deepEqual(inject, ['tools', 'fs', 'workingDirectory'])
})

test('apply registers six tools, the skill, one guidance section and the panel route', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs, withWeb: true })
  apply(fake.ctx, {})

  assert.equal(fake.tools.length, 6)
  assert.deepEqual(
    fake.tools.map(tool => tool.name),
    ['video_project', 'video_storyboard', 'video_take', 'video_audio', 'video_prompt', 'video_review'],
  )
  assert.equal(fake.skills.length, 1)
  assert.equal(fake.skills[0].name, 'ai-video-direction')
  assert.ok(fake.skills[0].content.length > 5000)

  assert.equal(fake.sections.length, 1)
  const section = fake.sections[0]
  assert.equal(section.name, 'dsh-director:guidance')
  assert.equal(section.order, 3200)
  assert.equal(section.interpolate, false)
  const text = section.text({ scope: {} })
  assert.match(text, /video_project/)
  assert.match(text, /ai-video-direction/)
  assert.match(text, /`video\/`/)

  assert.equal(fake.routes.length, 1)
  assert.equal(fake.routes[0].kind, 'prefix')
  assert.equal(fake.routes[0].path, '/dsh-director')
})

test('the guidance section disappears with the tools it names', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  apply(fake.ctx, {})
  const section = fake.sections[0]
  assert.notEqual(section.text({ scope: {} }), '')
  // Simulate the row being disabled after the section was registered.
  fake.tools.length = 0
  assert.equal(section.text({ scope: {} }), '')
})

test('guidance and skill switches remove their registrations, not the tools', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  apply(fake.ctx, { guidance: false, skill: false })
  assert.equal(fake.tools.length, 6)
  assert.equal(fake.skills.length, 0)
  assert.equal(fake.sections.length, 0)
})

test('the skill sentence disappears when the skill service is absent', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  // A context without `skills` skips that injection; the guidance stays.
  delete fake.ctx.skills
  apply(fake.ctx, {})
  assert.equal(fake.skills.length, 0)
  const text = fake.sections[0].text({ scope: {} })
  assert.match(text, /video_project/)
  assert.doesNotMatch(text, /ai-video-direction/)
})

test('a Host without a web server still mounts the tools', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  apply(fake.ctx, {})
  assert.equal(fake.tools.length, 6)
  assert.equal(fake.routes.length, 0)
})

test('invalid config fails the mount loudly', () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  assert.throws(() => apply(fake.ctx, { root: '../escape' }), /root must be a relative POSIX path/)
  assert.equal(fake.tools.length, 0)
})

test('custom root is reflected in the guidance and in the files the tools write', async () => {
  const fs = createFakeFs()
  const fake = createFakePluginContext({ fs })
  apply(fake.ctx, { root: 'films/night' })
  const text = fake.sections[0].text({ scope: {} })
  assert.match(text, /`films\/night\/`/)

  const projectTool = fake.tools.find(tool => tool.name === 'video_project')
  await projectTool.execute({ action: 'init', title: '夜班' }, { agent: { id: 'a' } })
  assert.ok(fs.get('/workspace/films/night/project.json'))
})

test('guidanceText is deterministic for the same config', () => {
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
  assert.equal(guidanceText(config, { withSkill: true }), guidanceText(config, { withSkill: true }))
})
