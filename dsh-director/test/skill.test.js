import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SKILL_DESCRIPTION,
  SKILL_NAME,
  SKILL_WHEN_TO_USE,
  loadSkillContent,
  skillDefinition,
} from '../skill.js'

test('the skill body is packaged and substantial', () => {
  const content = loadSkillContent()
  assert.ok(content.length > 5000, `skill.md is only ${content.length} characters`)
  assert.match(content, /^# AI 视频导演方法/)
  for (const tool of [
    'video_project',
    'video_storyboard',
    'video_take',
    'video_audio',
    'video_prompt',
    'video_review',
  ]) {
    assert.match(content, new RegExp(tool), `${tool} is named in the method`)
  }
  assert.match(content, /正向/)
  assert.match(content, /负向/)
  assert.match(content, /可灵/)
})

test('skill metadata follows the kebab-case contract', () => {
  assert.match(SKILL_NAME, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.ok(SKILL_DESCRIPTION.length > 80)
  assert.ok(SKILL_WHEN_TO_USE.length > 40)
  const definition = skillDefinition()
  assert.equal(definition.name, SKILL_NAME)
  assert.equal(definition.description, SKILL_DESCRIPTION)
  assert.equal(definition.whenToUse, SKILL_WHEN_TO_USE)
  assert.equal(definition.content, loadSkillContent())
})
