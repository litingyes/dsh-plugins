/**
 * dsh-context7 host half.
 *
 * The MCP integration itself lives in `cordis.patch.yml`; this entry exists only
 * to carry the package's `dsh.client` browser bundle, which registers the
 * dedicated Context7 tool rows in the conversation. It registers no Host
 * service and changes no tool behavior.
 */
export const name = 'context7-ui'

export function apply() {}
