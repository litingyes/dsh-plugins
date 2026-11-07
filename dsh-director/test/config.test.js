import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_CONFIG, guidanceText, resolveConfig } from '../index.js'
import { SKILL_NAME } from '../skill.js'

test('resolveConfig fills every default', () => {
  const config = resolveConfig()
  assert.deepEqual(config, { ...DEFAULT_CONFIG })
})

test('resolveConfig accepts overrides inside the bounds', () => {
  const config = resolveConfig({
    root: 'projects/night',
    guidance: false,
    skill: false,
    defaultAspect: '16:9',
    maxScenes: 8,
    maxShotsPerScene: 12,
    maxTakesPerShot: 4,
    maxPromptChars: 800,
    minShotSeconds: 2,
    maxShotSeconds: 6,
    durationTolerance: 0.3,
  })
  assert.equal(config.root, 'projects/night')
  assert.equal(config.guidance, false)
  assert.equal(config.defaultAspect, '16:9')
  assert.equal(config.maxShotSeconds, 6)
})

test('resolveConfig rejects unsafe roots', () => {
  for (const root of ['', '/abs', '../out', 'a//b', 'a/../b', 'a b', '.']) {
    assert.throws(() => resolveConfig({ root }), /root must be a relative POSIX path/, root)
  }
})

test('resolveConfig rejects unknown aspects and bad numbers', () => {
  assert.throws(() => resolveConfig({ defaultAspect: '2:1' }), /defaultAspect/)
  assert.throws(() => resolveConfig({ maxScenes: 0 }), /maxScenes/)
  assert.throws(() => resolveConfig({ maxScenes: 1.5 }), /maxScenes/)
  assert.throws(() => resolveConfig({ maxScenes: '10' }), /maxScenes/)
  assert.throws(() => resolveConfig({ durationTolerance: 2 }), /durationTolerance/)
  assert.throws(() => resolveConfig({ minShotSeconds: 5, maxShotSeconds: 4 }), /greater than minShotSeconds/)
})

test('resolveConfig rejects non-boolean switches', () => {
  assert.throws(() => resolveConfig({ guidance: 'yes' }), /guidance/)
  assert.throws(() => resolveConfig({ skill: 1 }), /skill/)
})

test('guidanceText names the tools, the root and the skill', () => {
  const config = resolveConfig({ root: 'film' })
  const text = guidanceText(config, { withSkill: true })
  assert.match(text, /`film\/`/)
  assert.match(text, new RegExp(SKILL_NAME))
  for (const tool of ['video_project', 'video_storyboard', 'video_take', 'video_audio', 'video_prompt', 'video_review']) {
    assert.match(text, new RegExp(tool))
  }
  assert.match(text, /never video/)
})

test('guidanceText drops the skill sentence when the skill is unavailable', () => {
  const config = resolveConfig()
  const text = guidanceText(config, { withSkill: false })
  assert.doesNotMatch(text, new RegExp(SKILL_NAME))
  assert.match(text, /video_project/)
})
