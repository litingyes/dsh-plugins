import assert from 'node:assert/strict'
import test from 'node:test'
import { DICTIONARIES, NS, en, resolveLanguage, translate, zh } from '../src/client/i18n.js'

test('both dictionaries carry exactly the same keys', () => {
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  assert.deepEqual(zhKeys, enKeys)
  assert.equal(zhKeys.length > 40, true, 'expected a populated dictionary')
})

test('no value is left empty or templated copy', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof value, 'string', key)
    assert.notEqual(value.trim(), '', key)
  }
  for (const [key, value] of Object.entries(zh)) {
    assert.notEqual(value.trim(), '', key)
  }
})

test('the namespace is stable — the Host locale files key off it', () => {
  assert.equal(NS, 'dsh-github')
  assert.deepEqual(Object.keys(DICTIONARIES).sort(), ['en', 'zh'])
})

test('interpolation fills every named slot and leaves unknown ones visible', () => {
  assert.equal(translate('en', 'list.comments', { count: 3 }), '3 comments')
  assert.equal(translate('zh', 'list.comments', { count: 3 }), '3 条评论')
  assert.equal(translate('en', 'list.pullMeta', { head: 'a', base: 'b' }), 'a → b')
  assert.equal(translate('en', 'list.comments', {}), '{count} comments')
})

test('an unknown key falls back to the key itself, never to undefined', () => {
  assert.equal(translate('zh', 'does.not.exist'), 'does.not.exist')
  assert.equal(translate('en', 'does.not.exist'), 'does.not.exist')
})

test('the language resolver prefers the snapshot, then the browser', () => {
  assert.equal(resolveLanguage({ getLocale: () => ({ active: 'zh-CN' }) }), 'zh')
  assert.equal(resolveLanguage({ getLocale: () => ({ id: 'en-US' }) }), 'en')
  assert.equal(resolveLanguage({ getLocale: () => ({ locale: 'zh' }) }), 'zh')
  assert.equal(resolveLanguage(undefined), String(navigator.language ?? 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en')
  assert.equal(
    resolveLanguage({
      getLocale: () => {
        throw new Error('service not ready')
      },
    }),
    String(navigator.language ?? 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en',
  )
})
