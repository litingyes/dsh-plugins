import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** A React stub: the module body only defines components, so nothing renders here. */
function makeReact() {
  const noop = () => undefined
  const identity = value => value
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    cloneElement: element => element,
    createRef: () => ({ current: null }),
    isValidElement: () => false,
    Fragment: Symbol('Fragment'),
    StrictMode: Symbol('StrictMode'),
    Suspense: Symbol('Suspense'),
    Children: { map: () => [], forEach: noop, toArray: () => [], count: () => 0, only: identity },
    createContext: (defaultValue) => ({
      _currentValue: defaultValue,
      Provider: Symbol('Provider'),
      Consumer: Symbol('Consumer'),
      displayName: undefined,
    }),
    forwardRef: render => render,
    memo: component => component,
    lazy: factory => factory,
    use: value => value,
    useState: value => [typeof value === 'function' ? value() : value, noop],
    useReducer: (_reducer, initial) => [initial, noop],
    useEffect: noop,
    useLayoutEffect: noop,
    useInsertionEffect: noop,
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useRef: value => ({ current: value }),
    useId: () => ':r0:',
    useContext: context => context?._currentValue,
    useImperativeHandle: noop,
    useDebugValue: noop,
    useDeferredValue: value => value,
    useTransition: () => [false, fn => fn()],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    startTransition: fn => fn(),
  }
}

/** Run the built bundle in a sandbox and capture the registered factory. */
function loadBundle() {
  const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')
  const registered = []
  const styles = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (definition) => {
          registered.push(definition)
        },
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      location: { origin: 'http://127.0.0.1:0' },
    },
    document: {
      documentElement: { lang: 'en' },
      head: { appendChild: () => undefined },
      createElement: () => {
        const element = { dataset: {}, textContent: '', remove: () => undefined }
        styles.push(element)
        return element
      },
    },
    // Base UI sniffs the platform at module init, so the stub answers the
    // handful of navigator fields every browser exposes.
    navigator: {
      language: 'en-US',
      languages: ['en-US'],
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    },
    fetch: () => Promise.reject(new Error('no network in this test')),
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  }
  sandbox.globalThis = sandbox
  createContext(sandbox)
  runInContext(source, sandbox, { filename: 'client.js' })
  return { registered, styles, sandbox }
}

/**
 * Minimal services the client half consumes.
 *
 * `inject` runs its callback against the same context, mirroring Cordis: the
 * right-Sidebar services are reached only once they exist, and the test wants
 * to see what that scope registers.
 */
function makeCtx(localeId = 'zh') {
  const registeredSlots = []
  const injectedSlots = []
  const injectedServices = []
  const localeDicts = []
  const tabTypes = []
  const disposers = []
  const ctx = {
    locale: {
      register: (namespace, dictionaries) => {
        localeDicts.push({ namespace, dictionaries })
        return () => undefined
      },
      bind: () => key => key,
      subscribe: () => () => undefined,
      getLocale: () => ({ id: localeId }),
    },
    effect: (callback, _label) => {
      const disposer = callback()
      disposers.push(typeof disposer === 'function' ? disposer : () => undefined)
      return () => undefined
    },
    inject: (names, callback) => {
      injectedServices.push(...names)
      callback(ctx)
      return () => undefined
    },
    slots: {
      inject: (name, callback) => {
        injectedSlots.push(name)
        callback()
        return () => undefined
      },
      register: (options, component) => {
        registeredSlots.push({ options, component })
        return () => undefined
      },
    },
    sidebarRightTabs: {
      register: definition => {
        tabTypes.push(definition)
        return () => undefined
      },
    },
  }
  return { ctx, registeredSlots, injectedSlots, injectedServices, localeDicts, tabTypes, disposers }
}

test('client.js registers exactly one module factory under the package name', () => {
  const { registered } = loadBundle()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, '@litingyes/dsh-git')
  assert.equal(typeof registered[0].factory, 'function')
})

test('the factory returns the plugin contract without touching the DOM tree', () => {
  const { registered } = loadBundle()
  const react = makeReact()
  const exports = registered[0].factory(name => {
    if (name === 'react' || name === 'react/jsx-runtime') return react
    if (name === 'react-dom') return {}
    throw new Error(`unexpected external module: ${name}`)
  })
  assert.equal(exports.name, 'dsh-git')
  // The bundle runs in its own realm, so compare membership rather than identity.
  assert.equal(exports.inject.join(','), 'slots,locale')
  assert.equal(typeof exports.apply, 'function')
})

test('apply contributes the dictionary, one stylesheet, and one right-Sidebar tab', () => {
  const { registered, styles } = loadBundle()
  const react = makeReact()
  const exports = registered[0].factory(name => {
    if (name === 'react' || name === 'react/jsx-runtime') return react
    if (name === 'react-dom') return {}
    throw new Error(`unexpected external module: ${name}`)
  })

  const harness = makeCtx('zh')
  exports.apply(harness.ctx)

  assert.equal(harness.localeDicts.length, 1)
  assert.equal(harness.localeDicts[0].namespace, 'dsh-git')
  assert.ok(harness.localeDicts[0].dictionaries.zh['panel.title'])
  assert.ok(harness.localeDicts[0].dictionaries.en['panel.title'])
  assert.ok(harness.localeDicts[0].dictionaries.zh['guide.title'])
  assert.ok(harness.localeDicts[0].dictionaries.en['guide.title'])

  // Both dictionaries must describe the same panel: a key that exists in only
  // one language renders as its own name in the other.
  const zhKeys = Object.keys(harness.localeDicts[0].dictionaries.zh).sort()
  const enKeys = Object.keys(harness.localeDicts[0].dictionaries.en).sort()
  assert.deepEqual(zhKeys, enKeys)

  assert.equal(styles.length, 1)
  assert.equal(styles[0].dataset.plugin, '@litingyes/dsh-git')
  assert.match(styles[0].textContent, /\.dgit-panel\{/u)
  assert.match(styles[0].textContent, /@container dgit/u)

  // The tab only exists where the right Sidebar exists.
  assert.deepEqual(harness.injectedServices, ['sidebarRightTabs'])
  assert.deepEqual(harness.injectedSlots, ['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])

  assert.equal(harness.tabTypes.length, 1)
  const type = harness.tabTypes[0]
  assert.equal(type.id, '@litingyes/dsh-git')
  assert.equal(type.kind, 'dsh-git')
  assert.equal(type.priority, 'extension')
  assert.equal(type.title(), 'Git')
  assert.equal(Array.isArray(type.guide), true)
  assert.equal(type.guide.length, 1)
  const card = type.guide[0]
  assert.equal(card.id, 'workspace')
  assert.equal(card.title(), '工作区 Git')
  assert.ok(card.description().length > 0)
  assert.equal(typeof card.icon, 'function')

  const body = harness.registeredSlots.find(entry => entry.options.name === 'sidebar.right.pane.tab')
  const title = harness.registeredSlots.find(entry => entry.options.name === 'sidebar.right.pane.tab.title')
  assert.ok(body !== undefined, 'the tab body must be registered')
  assert.ok(title !== undefined, 'the tab chip must be registered')
  assert.equal(body.options.key, type.id)
  assert.equal(body.options.locale, 'dsh-git')
  assert.equal(typeof body.component, 'function')
  assert.equal(title.options.key, type.id)
  assert.equal(typeof title.component, 'function')

  // The panel is a right-Sidebar tab now, not a main panel and not a left-rail icon.
  assert.equal(harness.registeredSlots.some(entry => entry.options.name === 'main'), false)
  assert.equal(harness.registeredSlots.some(entry => entry.options.name === 'sidebar.panellist'), false)
})

test('the tab type follows the active language', () => {
  const { registered } = loadBundle()
  const react = makeReact()
  const exports = registered[0].factory(name => {
    if (name === 'react' || name === 'react/jsx-runtime') return react
    if (name === 'react-dom') return {}
    throw new Error(`unexpected external module: ${name}`)
  })

  const zhHarness = makeCtx('zh')
  exports.apply(zhHarness.ctx)
  const zhType = zhHarness.tabTypes[0]
  assert.equal(zhType.title(), 'Git')
  assert.equal(zhType.guide[0].title(), '工作区 Git')

  const enHarness = makeCtx('en')
  exports.apply(enHarness.ctx)
  const enType = enHarness.tabTypes[0]
  assert.equal(enType.title(), 'Git')
  assert.equal(enType.guide[0].title(), 'Workspace Git')
  assert.notEqual(enType.guide[0].description(), zhType.guide[0].description())
})

test('the bundle declares no external module outside the shared table', () => {
  const source = readFileSync(path.join(packageRoot, 'client.js'), 'utf8')
  const found = new Set()
  for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)) found.add(match[1])
  assert.deepEqual([...found].sort(), ['react', 'react-dom', 'react/jsx-runtime'])
})

/** One declaration block from the panel stylesheet, or '' when absent. */
function styleBlock(css, selector) {
  const at = css.indexOf(`${selector}{`)
  if (at === -1) return ''
  const end = css.indexOf('}', at)
  return end === -1 ? '' : css.slice(at, end)
}

test('the row layout cannot overflow the right sidebar', () => {
  const { registered, styles } = loadBundle()
  const react = makeReact()
  const exports = registered[0].factory(name => {
    if (name === 'react' || name === 'react/jsx-runtime') return react
    if (name === 'react-dom') return {}
    throw new Error(`unexpected external module: ${name}`)
  })

  const harness = makeCtx('zh')
  exports.apply(harness.ctx)
  const css = styles[0].textContent

  // A `width:100%` row with horizontal padding is wider than its own container:
  // the trailing control then lands outside the scroller's clip box, which is
  // exactly the cut-off "Switch" button the panel started with.
  const row = styleBlock(css, '.dgit-filerow')
  assert.ok(row !== '', 'the file row must be styled')
  assert.match(row, /box-sizing:border-box/u)
  assert.equal(/width:100%/u.test(row), false)

  // The branch row keeps its text in a column that may shrink and its control
  // in a slot that may not, so the button is never pushed out of view.
  assert.match(css, /\.dgit-branchrow\{/u)
  const main = styleBlock(css, '.dgit-branchrow-main')
  assert.match(main, /min-width:0/u)
  const actions = styleBlock(css, '.dgit-branchrow-actions')
  assert.match(actions, /flex:0 0 auto|flex:none/u)

  // The narrow tier exists, so a very thin sidebar drops padding rather than
  // clipping content.
  assert.match(css, /@container dgit \(max-width:\s*(?:520|4[0-9]0|3[0-9]0)px\)/u)
})
