import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CONFIG,
  apply,
  guidanceText,
  resolveConfig,
} from '../index.js'

/**
 * Minimal stand-ins for the two services the Host half injects.
 *
 * @param {{ tools?: string[], mcpServersOrder?: number, withOrderLookup?: boolean }} [options]
 * @returns {{ ctx: object, sections: object[], injected: string[][] }} fake context.
 */
function fakeContext(options = {}) {
  const tools = options.tools ?? ['mcp__context7__query-docs']
  const order = options.mcpServersOrder ?? 3100
  const withOrderLookup = options.withOrderLookup ?? true
  const sections = []
  const injected = []

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
  }
  if (withOrderLookup) {
    host.systemPrompt.getSectionOrder = (name) => (name === 'MCP_SERVERS' ? order : undefined)
  }

  const ctx = {
    inject(deps, callback) {
      injected.push(deps)
      callback(host)
      return () => {}
    },
  }
  return { ctx, sections, injected }
}

test('registers one section gated on the two injected services', () => {
  const { ctx, sections, injected } = fakeContext()
  apply(ctx)

  assert.deepEqual(injected, [['systemPrompt', 'tools']])
  assert.equal(sections.length, 1)
})

test('section sits one step below the MCP client section', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx)

  assert.equal(sections[0].name, 'mcp:context7:guidance')
  assert.equal(sections[0].order, 3101)
  assert.equal(sections[0].interpolate, false)
})

test('order lookup falls back when the runtime no longer names MCP_SERVERS', () => {
  const { ctx, sections } = fakeContext({ withOrderLookup: false })
  apply(ctx)

  assert.equal(sections[0].order, 3101)
})

test('text is empty when the connector tools are not registered', () => {
  const { ctx, sections } = fakeContext({ tools: [] })
  apply(ctx)

  assert.equal(sections[0].text({ scope: undefined }), '')
  assert.equal(sections[0].text(), '')
})

test('text names both tools and the alternatives it must beat', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx)

  const text = sections[0].text({})
  assert.match(text, /mcp__context7__resolve-library-id/)
  assert.match(text, /mcp__context7__query-docs/)
  assert.match(text, /web_fetch/)
  // One sentence pair: state the situation, then the skip case.
  assert.equal(text.split('. ').length, 2)
  // `interpolate: false` means a stray `{{` would never throw, but keep the text clean.
  assert.equal(text.includes('{{'), false)
})

test('text is stable across assemblies', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx)

  assert.equal(sections[0].text({}), sections[0].text({}))
  assert.equal(sections[0].text({}), guidanceText('context7'))
})

test('a renamed server renames the tools and the section', () => {
  const { ctx, sections } = fakeContext({ tools: ['mcp__ctx7__query-docs'] })
  apply(ctx, { serverName: 'ctx7' })

  assert.equal(sections[0].name, 'mcp:ctx7:guidance')
  const text = sections[0].text({})
  assert.match(text, /mcp__ctx7__resolve-library-id/)
  assert.match(text, /mcp__ctx7__query-docs/)
  assert.equal(text.includes('mcp__context7__'), false)
})

test('guidance: false mounts nothing, so the row is still mountable without the text', () => {
  const { ctx, sections, injected } = fakeContext()
  apply(ctx, { guidance: false })

  assert.deepEqual(injected, [])
  assert.deepEqual(sections, [])
})

test('resolveConfig accepts an absent or empty config', () => {
  assert.deepEqual(resolveConfig(undefined), { ...DEFAULT_CONFIG })
  assert.deepEqual(resolveConfig({}), { ...DEFAULT_CONFIG })
  assert.deepEqual(resolveConfig({ guidance: false }), { guidance: false, serverName: 'context7' })
})

test('resolveConfig rejects values the MCP client would reject or silently ignore', () => {
  assert.throws(() => resolveConfig({ guidance: 'yes' }), /guidance must be a boolean/)
  assert.throws(() => resolveConfig({ serverName: '' }), /serverName must match/)
  assert.throws(() => resolveConfig({ serverName: 'has space' }), /serverName must match/)
  assert.throws(() => resolveConfig({ serverName: 'x'.repeat(33) }), /serverName must match/)
  assert.throws(() => resolveConfig([]), /config must be an object/)
})
