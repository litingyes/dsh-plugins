import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LABELS,
  paramEntries,
  paramLine,
  promptBlock,
  promptFields,
  promptSheet,
} from '../src/shared/prompt.js'

const project = {
  title: '夜班',
  logline: '夜班保安发现监控里多了一个自己。',
  aspect: '9:16',
  targetDurationSec: 40,
  language: 'zh',
}

const shot = {
  id: 'S1-01',
  durationSec: 4,
  shotSize: '中景',
  movement: '缓推',
  prompt: {
    text: '凌晨监控室，保安坐在操作台前',
    negative: '水印, 变形的手',
    product: '可灵',
    params: {
      duration: '5s',
      aspect: '9:16',
      firstFrame: 'assets/ref/guard.png',
      lastFrame: '',
      references: ['assets/ref/monitor.png'],
      seed: '42',
      extra: '运镜: 缓推',
    },
  },
}

test('promptFields falls back to the shot duration and project aspect', () => {
  const fields = promptFields({ id: 'S1-01', durationSec: 4, prompt: { text: 'x' } }, project)
  assert.equal(fields.text, 'x')
  assert.equal(fields.product, '')
  assert.equal(fields.params.duration, '4s')
  assert.equal(fields.params.aspect, '9:16')
  assert.deepEqual(fields.params.references, [])
})

test('promptFields keeps an explicit generation duration over the shot duration', () => {
  const fields = promptFields(shot, project)
  assert.equal(fields.params.duration, '5s')
})

test('paramEntries and paramLine label the non-empty parameters', () => {
  const fields = promptFields(shot, project)
  const entries = paramEntries(fields, 'zh')
  assert.deepEqual(
    entries.map(entry => entry.key),
    ['duration', 'aspect', 'firstFrame', 'references', 'seed', 'extra'],
  )
  assert.equal(entries[0].label, LABELS.zh.duration)
  assert.equal(entries[3].value, 'assets/ref/monitor.png')
  assert.match(paramLine(fields, 'zh'), /时长 5s · 比例 9:16 · 首帧 assets\/ref\/guard\.png/)
  assert.match(paramLine(fields, 'en'), /duration 5s · aspect 9:16/)
})

test('promptBlock keeps positive, negative and params apart', () => {
  const block = promptBlock(shot, project, { language: 'zh', headingLevel: 3 })
  assert.match(block, /^### S1-01 · 4s · 中景 \/ 缓推 · 可灵/m)
  assert.match(block, /\*\*正向提示词\*\*/)
  assert.match(block, /凌晨监控室/)
  assert.match(block, /\*\*负向提示词\*\*/)
  assert.match(block, /水印, 变形的手/)
  assert.match(block, /- 参考图: assets\/ref\/monitor\.png/)
  assert.ok(block.indexOf('正向提示词') < block.indexOf('负向提示词'))
})

test('promptBlock marks an empty prompt instead of rendering a blank line', () => {
  const block = promptBlock({ id: 'S1-01', durationSec: 4, prompt: {} }, project, { language: 'zh' })
  assert.match(block, /（空）/u)
})

test('promptSheet lists every scene and shot in film order', () => {
  const storyboard = {
    scenes: [
      {
        id: 'S1',
        title: '监控室',
        purpose: 'hook',
        shots: [shot],
      },
      {
        id: 'S2',
        title: '走廊',
        purpose: 'turn',
        shots: [{ id: 'S2-01', durationSec: 3, prompt: { text: '空走廊' } }],
      },
    ],
  }
  const sheet = promptSheet({ project, storyboard, language: 'zh' })
  assert.match(sheet, /^# 夜班 — 提示词清单/m)
  assert.match(sheet, /> 夜班保安发现监控里多了一个自己。/)
  assert.match(sheet, /比例 9:16 · 目标 40s · 计划 7s/)
  assert.match(sheet, /## S1 监控室 \(hook\)/)
  assert.match(sheet, /## S2 走廊 \(turn\)/)
  assert.ok(sheet.indexOf('S1-01') < sheet.indexOf('S2-01'))

  const oneScene = promptSheet({ project, storyboard, language: 'zh', sceneId: 'S2' })
  assert.match(oneScene, /S2-01/)
  assert.doesNotMatch(oneScene, /S1-01/)
})

test('promptSheet says so when there are no shots', () => {
  const sheet = promptSheet({ project, storyboard: { scenes: [] }, language: 'en' })
  assert.match(sheet, /\(empty\)/)
})
