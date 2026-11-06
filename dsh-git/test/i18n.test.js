/**
 * Locale resolution and the branch-chip copy.
 *
 * The Client locale service publishes `{ active, locales, revision }`; reading
 * only `id` / `locale` silently fell back to the browser language and left the
 * whole plugin in English inside a Chinese app. These tests pin the real shape
 * and the legacy fallbacks.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLanguage, translate } from '../src/client/i18n.js'

test('resolveLanguage reads the active field of the real snapshot', () => {
  const snapshot = active => ({ getLocale: () => ({ active, locales: [], revision: 3 }) })
  assert.equal(resolveLanguage(snapshot('zh')), 'zh')
  assert.equal(resolveLanguage(snapshot('en')), 'en')
  assert.equal(resolveLanguage(snapshot('zh-CN')), 'zh')
  assert.equal(resolveLanguage(snapshot('zh-Hans')), 'zh')
})

test('resolveLanguage keeps the legacy snapshot shapes working', () => {
  assert.equal(resolveLanguage({ getLocale: () => ({ id: 'zh' }) }), 'zh')
  assert.equal(resolveLanguage({ getLocale: () => ({ locale: 'zh-CN' }) }), 'zh')
})

test('resolveLanguage falls back to a supported language without a service', () => {
  const resolved = resolveLanguage(undefined)
  assert.ok(resolved === 'zh' || resolved === 'en')
})

test('branch copy resolves in both languages', () => {
  assert.equal(translate('zh', 'branch.title'), '切换分支')
  assert.equal(translate('en', 'branch.title'), 'Switch branch')
  assert.equal(translate('zh', 'branch.newPlaceholder'), '新分支名')
  assert.equal(translate('en', 'branch.newPlaceholder'), 'New branch name')
  assert.equal(translate('zh', 'branch.dirty', { n: 3 }), '3 个文件有未提交的改动')
  assert.equal(translate('en', 'branch.dirty', { n: 3 }), '3 files with uncommitted changes')
  assert.equal(translate('zh', 'missing.key'), 'missing.key')
})
