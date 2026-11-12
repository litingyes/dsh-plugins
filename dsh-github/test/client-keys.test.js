import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { en, zh } from '../src/client/i18n.js'
import { KNOWN_ERRORS } from '../src/client/actions.js'

const CLIENT_DIR = new URL('../src/client/', import.meta.url)

/** Every literal `t('key')` in the panel sources, with the file that used it. */
function literalKeys() {
  const used = new Map()
  for (const file of readdirSync(CLIENT_DIR)) {
    if (!/\.(jsx|js)$/u.test(file) || file === 'i18n.js') continue
    const text = readFileSync(new URL(file, CLIENT_DIR), 'utf8')
    for (const match of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/gu)) {
      if (!used.has(match[1])) used.set(match[1], file)
    }
  }
  return used
}

test('every key the panel asks for exists in both languages', () => {
  const missing = []
  for (const [key, file] of literalKeys()) {
    if (!(key in en)) missing.push(`${key} (en) ← ${file}`)
    if (!(key in zh)) missing.push(`${key} (zh) ← ${file}`)
  }
  assert.deepEqual(missing, [])
})

test('every failure code the panel can render has a sentence of its own', () => {
  const missing = []
  for (const code of KNOWN_ERRORS) {
    if (!(`error.${code}` in en)) missing.push(`error.${code} (en)`)
    if (!(`error.${code}` in zh)) missing.push(`error.${code} (zh)`)
  }
  assert.deepEqual(missing, [])
})

test('the keys the panel builds dynamically all exist', () => {
  // `t(\`tabs.${id}\`)` in the panel and the two filter vocabularies.
  for (const tab of ['issues', 'pulls', 'notifications']) {
    assert.ok(`tabs.${tab}` in en, `tabs.${tab}`)
    assert.ok(`tabs.${tab}` in zh, `tabs.${tab}`)
  }
  for (const filter of ['all', 'open', 'closed', 'assigned', 'created']) {
    assert.ok(`filter.${filter}` in en, `filter.${filter}`)
  }
})

test('no dictionary key is left unused by the panel', () => {
  // A key nobody reads is either a typo or dead copy; both are worth catching
  // before a translator spends time on them.
  const used = literalKeys()
  const dynamicPrefixes = ['error.', 'tabs.', 'filter.']
  const allowedUnused = new Set([
    'tab.title',
    'guide.title',
    'guide.description',
    'auth.configured',
    'auth.reimport',
    'auth.scopesMissing',
    'panel.empty',
    'list.noBody',
    'detail.confirm',
  ])
  const unused = Object.keys(en).filter(key => {
    if (used.has(key) || allowedUnused.has(key)) return false
    return !dynamicPrefixes.some(prefix => key.startsWith(prefix))
  })
  assert.deepEqual(unused, [])
})
