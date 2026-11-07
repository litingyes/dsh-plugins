import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DICTIONARIES, en, resolveLanguage, translate, zh } from '../src/client/i18n.js'

test('the two dictionaries cover the same keys', () => {
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  assert.deepEqual(enKeys, zhKeys)
  assert.deepEqual(Object.keys(DICTIONARIES).sort(), ['en', 'zh'])
})

test('translate interpolates and falls back to the key', () => {
  assert.equal(translate('zh', 'storyboard.takes', { n: 3 }), '3 个 take')
  assert.equal(translate('en', 'storyboard.takes', { n: 3 }), '3 take(s)')
  assert.equal(translate('en', 'does.not.exist'), 'does.not.exist')
})

test('every review code the host can emit has a label', () => {
  const codes = [
    'PROJECT_MISSING',
    'STORYBOARD_MISSING',
    'AUDIO_MISSING',
    'UNREADABLE_FILE',
    'SCENE_WITHOUT_SHOTS',
    'DUPLICATE_ID',
    'SHOT_INVALID_DURATION',
    'SHOT_MISSING_ACTION',
    'SHOT_MISSING_PROMPT',
    'PROMPT_TOO_LONG',
    'PROMPT_CONTAINS_NEGATIVE_LABEL',
    'SHOT_MISSING_PRODUCT',
    'MISSING_ASPECT_IN_PARAMS',
    'PROMPT_DURATION_MISMATCH',
    'SELECTED_TAKE_MISSING',
    'MULTIPLE_SELECTED_TAKES',
    'GENERATED_WITHOUT_TAKES',
    'MISSING_VO_FOR_DIALOGUE',
    'CHARACTER_UNDEFINED',
    'SHOT_SIZE_MISSING',
    'MOVEMENT_MISSING',
    'VO_TOO_LONG',
    'UNKNOWN_AUDIO_TARGET',
    'NO_MUSIC',
    'NO_SFX',
    'DURATION_DRIFT',
    'SCENE_PURPOSE_MISSING',
    'MISSING_LOGLINE',
    'MISSING_TARGET_DURATION',
    'UNKNOWN_STATUS',
    'TAKE_FILE_MISSING',
    'REFERENCE_FILE_MISSING',
  ]
  for (const code of codes) {
    assert.ok(typeof zh[`review.code.${code}`] === 'string', `zh label for ${code}`)
    assert.ok(typeof en[`review.code.${code}`] === 'string', `en label for ${code}`)
  }
})

test('resolveLanguage reads the locale service and defaults safely', () => {
  const make = active => ({ getLocale: () => ({ active }) })
  assert.equal(resolveLanguage(make('zh-CN')), 'zh')
  assert.equal(resolveLanguage(make('en-US')), 'en')
  assert.equal(resolveLanguage({ getLocale: () => ({ id: 'zh' }) }), 'zh')
  assert.equal(resolveLanguage({ getLocale: () => ({ locale: 'en' }) }), 'en')
  assert.equal(resolveLanguage({ getLocale: () => ({}) }), 'en')
  assert.equal(resolveLanguage(undefined), 'en')
})
