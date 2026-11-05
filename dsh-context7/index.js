/**
 * `@litingyes/dsh-context7` host half.
 *
 * Two jobs, both about the model-facing side of the integration:
 *
 *   1. Carry the package's `dsh.client` browser bundle, which registers the
 *      dedicated Context7 rows in the conversation. (No Host code involved.)
 *   2. Give the connector its own always-on trigger text. The MCP client that
 *      `cordis.patch.yml` mounts re-publishes the Context7 server's own
 *      `initialize.instructions` as a prompt section, but that text never names
 *      the tools (`mcp__context7__resolve-library-id` /
 *      `mcp__context7__query-docs`) and never says when a library answer should
 *      beat memory or `web_fetch`. In practice it loses to both: across ~5,900
 *      recorded tool calls those two tools accounted for ~0.3%. This section
 *      sits one order step below that vendor paragraph, names the tools
 *      literally, and disappears again when they are not registered.
 *
 * The MCP connection itself stays entirely in `cordis.patch.yml`.
 *
 * @module @litingyes/dsh-context7
 */

export const name = 'context7-ui'

/** `serverName` of the MCP row inserted by this bundle; also the tool prefix. */
export const DEFAULT_SERVER_NAME = 'context7'

/** Same contract the MCP client enforces for `serverName`. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * Section order used when the Harness no longer resolves `MCP_SERVERS`
 * (`getSectionOrder()` returned a non-finite value), so guidance never becomes
 * a silent no-op on a newer runtime. Mirrors the current value, 3100, plus one.
 */
const FALLBACK_SECTION_ORDER = 3101

/** Config defaults; a row may override either field. */
export const DEFAULT_CONFIG = Object.freeze({
  guidance: true,
  serverName: DEFAULT_SERVER_NAME,
})

/**
 * Validate the row config.
 *
 * @param {Record<string, unknown> | undefined} raw the row's `config`.
 * @returns {{ guidance: boolean, serverName: string }} resolved config.
 */
export function resolveConfig(raw) {
  const config = raw ?? {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('dsh-context7: config must be an object')
  }
  const guidance = config.guidance ?? DEFAULT_CONFIG.guidance
  if (typeof guidance !== 'boolean') {
    throw new TypeError(`dsh-context7: guidance must be a boolean, got ${JSON.stringify(guidance)}`)
  }
  const serverName = config.serverName ?? DEFAULT_CONFIG.serverName
  if (typeof serverName !== 'string' || !SERVER_NAME_PATTERN.test(serverName)) {
    throw new TypeError(`dsh-context7: serverName must match ${String(SERVER_NAME_PATTERN)}, got ${JSON.stringify(serverName)}`)
  }
  return { guidance, serverName }
}

/**
 * The model-facing trigger text.
 *
 * States the situation (third-party API questions), the two calls in order, what
 * it must beat, and the one case that should skip it — the four things that the
 * vendor `instructions` and the remote tool descriptions leave implicit.
 *
 * @param {string} serverName the MCP row's `serverName`, which prefixes tool names.
 * @returns {string} section text.
 */
export function guidanceText(serverName) {
  const resolve = `mcp__${serverName}__resolve-library-id`
  const query = `mcp__${serverName}__query-docs`
  return (
    `For third-party library, framework, SDK, or CLI questions — setup, configuration, migration, or version-specific behavior — call ${resolve} and then ${query} before answering from memory or fetching documentation with web_fetch. ` +
    "Skip both when the answer is in this workspace's own code or in the installed package's types."
  )
}

/**
 * Resolve the section placement directly below the MCP client's own section.
 *
 * @param {{ getSectionOrder?: (name: string) => number }} systemPrompt registry service.
 * @returns {number} finite order.
 */
function sectionOrder(systemPrompt) {
  const base = typeof systemPrompt.getSectionOrder === 'function' ? systemPrompt.getSectionOrder('MCP_SERVERS') : undefined
  return Number.isFinite(base) ? base + 1 : FALLBACK_SECTION_ORDER
}

/**
 * Mount the browser bundle carrier and the Context7 trigger text.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx the row's context.
 * @param {Record<string, unknown>} [rawConfig] the row's `config`.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  if (!config.guidance) return

  const queryTool = `mcp__${config.serverName}__query-docs`
  const text = guidanceText(config.serverName)

  ctx.inject(['systemPrompt', 'tools'], (host) => {
    host.systemPrompt.section({
      name: `mcp:${config.serverName}:guidance`,
      order: sectionOrder(host.systemPrompt),
      interpolate: false,
      /**
       * Registered for the whole Host, so it renders for every Agent — keep it
       * empty while the connector it talks about is absent (row disabled,
       * startup failure, or a rename that did not reach this config).
       */
      text: (context = {}) => {
        const scope = context?.scope
        return host.tools.get(queryTool, scope) === undefined ? '' : text
      },
    })
  })
}
