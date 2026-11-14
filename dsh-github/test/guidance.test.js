import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { DEFAULT_CONFIG, apply, guidanceText, resolveConfig } from '../index.js'

const ALLOW = Symbol('allow')

/**
 * Minimal stand-ins for the services the Host half reaches for.
 *
 * @param {{tools?: string[], mcpServersOrder?: number, withOrderLookup?: boolean, services?: object}} [options]
 *   fake composition.
 * @returns {{ctx: object, sections: object[], injected: string[][], listeners: object, routes: object[], effects: string[]}}
 *   recorded registrations.
 */
function fakeContext(options = {}) {
  const tools = options.tools ?? ['mcp__github__get_me']
  const order = options.mcpServersOrder ?? 3100
  const withOrderLookup = options.withOrderLookup ?? true
  const services = options.services ?? {}
  const sections = []
  const injected = []
  const listeners = {}
  const routes = []
  const effects = []

  const host = {
    systemPrompt: {
      section(definition) {
        sections.push(definition)
        return () => {}
      },
    },
    tools: {
      get(name) {
        return tools.includes(name) ? { name } : undefined
      },
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    credentials: services.credentials,
    get(name) {
      return services[name]
    },
    effect(factory, label) {
      effects.push(label)
      return factory()
    },
  }
  if (withOrderLookup) {
    host.systemPrompt.getSectionOrder = name => (name === 'MCP_SERVERS' ? order : undefined)
  }

  const ctx = {
    inject(deps, callback) {
      injected.push(deps)
      callback(host)
      return () => {}
    },
    on(event, handler) {
      listeners[event] = handler
      return () => {}
    },
    effect(factory, label) {
      effects.push(label)
      return factory()
    },
    get(name) {
      return services[name]
    },
  }
  return { ctx, sections, injected, listeners, routes, effects }
}

const next = () => ALLOW

test('defaults are explicit and complete', () => {
  assert.deepEqual(resolveConfig(undefined), { ...DEFAULT_CONFIG })
  assert.equal(DEFAULT_CONFIG.serverName, 'github')
  assert.equal(DEFAULT_CONFIG.credentialRef, 'GITHUB_TOKEN')
  assert.equal(DEFAULT_CONFIG.panelWrites, true)
})

test('a bad config fails at mount instead of degrading', () => {
  const bad = [
    { serverName: 'bad name!' },
    { serverName: '' },
    { credentialRef: '9LIVES' },
    { credentialRef: 'has-dash' },
    { maxItems: 5 },
    { maxItems: 101 },
    { cacheMs: -1 },
    { requestTimeoutMs: 10 },
    { approvalTools: 'issue_write' },
    { skipApprovalTools: [1] },
    { ghCommand: '   ' },
    { apiBase: 'ftp://example.com' },
    { approval: 'yes' },
    { panelWrites: 1 },
  ]
  for (const raw of bad) {
    assert.throws(() => resolveConfig(raw), TypeError, JSON.stringify(raw))
  }
})

test('trailing slashes are stripped from apiBase', () => {
  assert.equal(resolveConfig({ apiBase: 'https://ghe.example.com/api/v3///' }).apiBase, 'https://ghe.example.com/api/v3')
})

test('the plugin registers guidance, one approval listener and one route', () => {
  const { ctx, injected, routes, effects, listeners } = fakeContext()
  apply(ctx)

  assert.deepEqual(injected, [['credentials'], ['systemPrompt', 'tools'], ['webServer']])
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/dsh-github')
  assert.equal(typeof routes[0].handler, 'function')
  assert.deepEqual(effects, ['dsh-github: write approval', 'dsh-github: api route'])
  assert.equal(typeof listeners['tools/pre-execute'], 'function')
})

/** Drive one prefix-route handler and return its JSON answer. */
function callRoute(handler, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = Readable.from([])
    req.method = method
    req.url = url
    req.headers = {}
    req.complete = true
    const res = {
      statusCode: 0,
      headers: {},
      headersSent: false,
      setHeader(name, value) {
        this.headers[name] = value
      },
      end(payload) {
        resolve({ statusCode: this.statusCode, body: JSON.parse(payload) })
      },
    }
    handler(req, res).catch(reject)
  })
}

test('the store injected after mount is the one the panel reports', async () => {
  const store = {
    describe: async () => ({ configured: false, writable: true }),
    set: async () => {},
  }
  const { ctx, routes } = fakeContext({ services: { credentials: store } })
  apply(ctx)

  const answer = await callRoute(routes[0].handler, '/dsh-github/auth')
  assert.equal(answer.statusCode, 200)
  assert.equal(answer.body.importable, true)
})

test('guidance sits one step below the MCP client section and follows the server name', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'mcp:github:guidance')
  assert.equal(sections[0].order, 3101)
  assert.equal(sections[0].interpolate, false)

  const renamed = fakeContext({ tools: ['mcp__gh__get_me'] })
  apply(renamed.ctx, { serverName: 'gh' })
  assert.equal(renamed.sections[0].name, 'mcp:gh:guidance')
  assert.match(renamed.sections[0].text({}), /mcp__gh__get_me/u)
})

test('order lookup falls back when the runtime no longer names MCP_SERVERS', () => {
  const { ctx, sections } = fakeContext({ withOrderLookup: false })
  apply(ctx)
  assert.equal(sections[0].order, 3101)
})

test('the guidance text is empty while the connector is absent', () => {
  const { ctx, sections } = fakeContext({ tools: [] })
  apply(ctx)
  assert.equal(sections[0].text({ scope: undefined }), '')
  assert.equal(sections[0].text(), '')
})

test('the guidance text names the tools, the repository rule and the approval rule', () => {
  const text = guidanceText('github')
  assert.match(text, /mcp__github__get_me/u)
  assert.match(text, /mcp__github__issue_read/u)
  assert.match(text, /git remote get-url origin/u)
  assert.match(text, /approval/u)
})

test('guidance and approval can each be switched off', () => {
  const noGuidance = fakeContext()
  apply(noGuidance.ctx, { guidance: false })
  assert.equal(noGuidance.sections.length, 0)

  const noApproval = fakeContext()
  apply(noApproval.ctx, { approval: false })
  assert.equal(noApproval.listeners['tools/pre-execute'], undefined)
})

test('the approval listener asks for writes and passes reads through', () => {
  const { ctx, listeners } = fakeContext()
  apply(ctx)
  const preExecute = listeners['tools/pre-execute']

  const ask = preExecute({ name: 'mcp__github__issue_write' }, next)
  assert.equal(ask.kind, 'ask')
  assert.equal(ask.reason, 'GitHub write: issue_write')
  assert.equal(typeof ask.displayReason.en, 'string')
  assert.equal(typeof ask.displayReason.zh, 'string')

  assert.equal(preExecute({ name: 'mcp__github__list_issues' }, next), ALLOW)
  assert.equal(preExecute({ name: 'mcp__context7__query-docs' }, next), ALLOW)
  assert.equal(preExecute({ name: 'bash' }, next), ALLOW)
  assert.equal(preExecute({}, next), ALLOW)
})

test('both approval lists are honoured', () => {
  const { ctx, listeners } = fakeContext()
  apply(ctx, { approvalTools: ['list_issues'], skipApprovalTools: ['push_files'] })
  const preExecute = listeners['tools/pre-execute']

  assert.equal(preExecute({ name: 'mcp__github__list_issues' }, next).kind, 'ask')
  assert.equal(preExecute({ name: 'mcp__github__push_files' }, next), ALLOW)
  assert.equal(preExecute({ name: 'mcp__github__create_pull_request' }, next).kind, 'ask')
})

test('every route is inside the plugin prefix and a foreign path is refused', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)
  const handler = routes[0].handler

  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body
    },
  }
  await handler({ method: 'GET', url: '/dsh-git/api/state', headers: {}, on() {} }, res)
  assert.equal(res.statusCode, 404)
})
