import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const requireFromHere = createRequire(import.meta.url)

/**
 * Load the committed browser artifact the way the Web UI does: it registers a
 * factory on `window.__ModuleLoader__`, and the loader calls that factory with
 * its own `require`. Testing the artifact (not the sources) is the point: it is
 * what ships, it is committed, and a build that silently externalizes something
 * must fail here rather than in the browser.
 *
 * @returns {{id: string, module: object}} the registered entry and its exports.
 */
function loadBundle() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const entries = []
  const sandbox = {
    window: { __ModuleLoader__: { load: entry => entries.push(entry) } },
    require: specifier => requireFromHere(specifier),
    console,
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.equal(entries.length, 1)
  const [entry] = entries
  return { id: entry.id, module: entry.factory(specifier => requireFromHere(specifier)) }
}

/** A Client context that records what the plugin registers. */
function fakeClientContext() {
  const effects = []
  const dictionaries = []
  const tabs = []
  const slots = []
  const injected = []
  const scoped = {
    effect(factory, label) {
      effects.push(label)
      return factory()
    },
    sidebarRightTabs: {
      register(definition) {
        tabs.push(definition)
        return () => {}
      },
    },
    slots: {
      inject(name, callback) {
        return callback()
      },
      register(options) {
        slots.push(options)
        return () => {}
      },
    },
  }
  const ctx = {
    locale: {
      register(namespace, tables) {
        dictionaries.push({ namespace, tables })
        return () => {}
      },
      subscribe() {
        return () => {}
      },
      getLocale() {
        return { active: 'zh-CN' }
      },
    },
    effect(factory, label) {
      effects.push(label)
      return factory()
    },
    inject(deps, callback) {
      injected.push(deps)
      callback(scoped)
      return () => {}
    },
  }
  return { ctx, effects, dictionaries, tabs, slots, injected }
}

test('the artifact registers one factory under the package name', () => {
  const { id, module } = loadBundle()
  assert.equal(id, '@litingyes/dsh-github')
  assert.equal(module.name, 'dsh-github')
  // Built inside the bundle realm, so compare by value rather than prototype.
  assert.deepEqual(module.inject.join('+'), 'slots+locale')
  assert.equal(typeof module.apply, 'function')
})

test('apply registers the dictionaries, the stylesheet and the tab type', () => {
  const { module } = loadBundle()
  const { ctx, effects, dictionaries, tabs, slots, injected } = fakeClientContext()

  // `typeof document === 'undefined'` here, so the style effect is a no-op —
  // which is exactly what the guard is for.
  module.apply(ctx)

  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'dsh-github')
  assert.deepEqual(Object.keys(dictionaries[0].tables).sort(), ['en', 'zh'])

  // The dependency list is built inside the bundle realm; compare it by value.
  assert.deepEqual(injected.map(deps => deps.join('+')), ['sidebarRightTabs'])
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, '@litingyes/dsh-github')
  assert.equal(tabs[0].kind, 'dsh-github')
  assert.equal(tabs[0].priority, 'extension')
  assert.equal(typeof tabs[0].title, 'function')
  assert.equal(tabs[0].guide.length, 1)
  assert.equal(tabs[0].guide[0].id, 'workspace')
  assert.equal(typeof tabs[0].guide[0].icon, 'function')

  const names = slots.map(entry => entry.name).sort()
  assert.deepEqual(names, ['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
  assert.ok(slots.every(entry => entry.key === '@litingyes/dsh-github'))

  assert.deepEqual(effects, [
    'dsh-github: dictionaries',
    'dsh-github: styles',
    'dsh-github: right sidebar tab type',
    'dsh-github: right sidebar tab body',
    'dsh-github: right sidebar tab title',
  ])
})

test('the tab title renders the locale-bound label, not a frozen string', () => {
  const { module } = loadBundle()
  const { ctx, tabs } = fakeClientContext()
  module.apply(ctx)
  // The panel picks its language from the locale service, which reports zh here.
  assert.equal(tabs[0].title(), 'GitHub')
})

test('the bundle externalizes nothing but React', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const required = new Set()
  for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)) required.add(match[1])
  assert.deepEqual([...required].sort(), ['react'])
})
