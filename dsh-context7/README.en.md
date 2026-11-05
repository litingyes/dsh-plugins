# dsh-context7

Connects the official [Context7](https://context7.com) MCP server to DeepSeek Harness through the DSH-shipped MCP client. The agent can resolve a library name to a Context7 library ID and then fetch current documentation and code examples instead of relying on stale training data.

The bundle has two halves: `cordis.patch.yml` inserts one `@deepseek-ai/dsh-mcp-client` row (connection and tools), and `index.js` is a small Host half that carries the browser-side tool rows **and one always-on trigger paragraph** (see [Why it rarely fires](#why-it-rarely-fires)). The connection itself stays pure configuration; there is no custom protocol code.

## Tools

| Tool | Purpose | Main parameters |
| --- | --- | --- |
| `mcp__context7__resolve-library-id` | Resolve a library name to a Context7 library ID (for example `/vercel/next.js`) | `libraryName`, `query` |
| `mcp__context7__query-docs` | Fetch current documentation and code examples for a library ID | `libraryId`, `query`, optional `language` |

Names come from `serverName: context7` plus the server's own tool names; they change if Context7 renames a tool.

### Conversation presentation

The browser half is **presentation-only**: it replaces the generic tool card for these two tools with a Context7 mark row (`Context7 · Resolve library / Query docs`), expandable to the request and the returned documentation. Tool behavior, names, and results are unchanged. The browser module loads when the page starts: after the first install or a presentation change, **refresh the page**; if the row still does not change, restart the desktop app (the running Host caches the package manifests it scanned at startup).

## Why it rarely fires

Installing a tool does not make the model use it. Measured on this machine (57 sessions, 5,527 `tool/call` events): the two Context7 tools were called 18 times, **0.33%** of all tool calls, several of them by the author testing them; in the 22.6 hours after the plugin was installed, only 2 of 26 sessions reached them unprompted. Three causes:

1. **The system prompt never names the tools.** The MCP client republishes Context7's `initialize.instructions` verbatim as a `### MCP server: context7` section — strong prose, but it never mentions `mcp__context7__*`. The only actionable step in that region is the core `## MCP resource servers` line pointing at `list_mcp_resources`, and Context7 has no resources at all (`resources: []`, `resourceTemplates: []`): a dead end.
2. **It queues behind memory and `web_fetch`.** Reading `node_modules`, `npm view`, or `web_fetch` is closer and more habitual for the model: in the same window, 287 bash reads of `node_modules`, 23 npm lookups, and 15 Context7 calls. `web_fetch` also fails 38% of the time on this profile, so it is not even a reliable substitute.
3. **Hand-installed skills siphon it.** `~/.agents/skills/context7-mcp` names `resolve-library-id` without the `mcp__` prefix; `~/.agents/skills/find-docs` has the louder catalog description but routes to the `npx ctx7` CLI instead of these tools (that command ran 0 times across all sessions).

## What the plugin adds

`index.js` appends one always-on section **after** the MCP client's own section (`MCP_SERVERS`, order 3100), at order 3101. It names the two tools, states that they beat memory and `web_fetch`, and gives the one case that should skip them:

> For third-party library, framework, SDK, or CLI questions — setup, configuration, migration, or version-specific behavior — call `mcp__context7__resolve-library-id` and then `mcp__context7__query-docs` before answering from memory or fetching documentation with web_fetch. Skip both when the answer is in this workspace's own code or in the installed package's types.

About 360 characters (≈90 tokens), mounted at the Host root, so it applies once per request to every Agent, subagents included. It is **self-healing**: before rendering it asks `tools.get()` whether `mcp__context7__query-docs` is actually registered, and returns an empty string when it is not (connector row disabled, startup failure, or a `serverName` rename that did not reach this config). The whole paragraph then disappears instead of pointing at tools that do not exist.

## Requirements

- DSH `>= 0.2.1-rc.5 < 0.3.0` (verified on `0.2.1-rc.5`)
- Network access to `https://mcp.context7.com/mcp`
- Node.js 24+ only for `scripts/usage-report.mjs` and the tests (built-in zstd)

## Install

Install through the plugin manager (the Web **Plugins** page or the `plugin_manager` tool in a session):

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-context7
```

From npm:

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.2.0
```

A new bundle normally activates through HMR; if the result reports `restart-required`, restart the desktop app. Note that `index.js` is Host code: after installing or updating, reload the plugin row or restart the Host so the model sees the new guidance paragraph.

## API key (optional)

Context7 works without a key under an anonymous, IP-based rate limit. For higher limits:

```sh
# ~/.dsh/.env or the environment that launches DSH
CONTEXT7_API_KEY=ctx7sk_...
```

The plugin reads the variable while loading its config and sends `Authorization: Bearer <key>` only when it is non-blank, so the key never lives in this repository or a profile config. Reload the plugin or restart the Host after changing it.

## Configuration overrides

Defaults live in `cordis.patch.yml`. To change them, override the row id in the profile patch layer (`$DSH_HOME/profiles/<name>/cordis.patch.yml`). A row override replaces `config` **wholesale**, so restate every field the row needs.

Connector row `context7`:

```yaml
- id: context7
  config:
    serverName: context7
    transport: streamable-http
    url: https://mcp.context7.com/mcp
    headers: !!js "(process.env.CONTEXT7_API_KEY && process.env.CONTEXT7_API_KEY.trim() ? { Authorization: 'Bearer ' + process.env.CONTEXT7_API_KEY.trim() } : {})"
    failOnStartupError: false
    toolCallTimeoutMs: 90000
```

- `failOnStartupError`: defaults to `true`, so a failed connection at install/startup is reported; other profile plugins keep running. Set it to `false` to let the reconnect policy recover in the background instead.
- `toolCallTimeoutMs`: defaults to `60000`. Raise it when Context7 retrieval is slow.
- `reconnect`: enabled by default (500 ms initial delay, exponential backoff, 10 attempts); override with an object.

Guidance row `context7-ui`:

```yaml
- id: context7-ui
  config:
    guidance: true
    serverName: context7
```

- `guidance`: defaults to `true`. Setting it to `false` removes only the paragraph above; tools, presentation, and the connection are unaffected.
- `serverName`: defaults to `context7` and **must match the connector row's `serverName`**; after a rename the guidance follows the new tool prefix, otherwise it hides itself because the names no longer line up.

## Verify

1. The Plugins page shows **Context7 Documentation** with an `mcp-client` row.
2. A new turn exposes `mcp__context7__resolve-library-id` and `mcp__context7__query-docs`.
3. Ask the agent about any library; it should resolve the library ID first and then fetch documentation.
4. Confirm the guidance reached the system prompt — session logs are zstd-compressed JSONL, so decompress and grep (Node 24+):

```sh
node -e 'const fs=require("fs"),z=require("zlib");process.stdout.write(z.zstdDecompressSync(fs.readFileSync(process.argv[1])).toString())' \
  "$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd" \
  | grep -c "mcp__context7__resolve-library-id"
```

## Measuring usage

To see whether it actually gets used, count `tool/call` events across every local session:

```sh
node scripts/usage-report.mjs                  # mcp__context7__ by default
node scripts/usage-report.mjs web_             # any tool prefix
node scripts/usage-report.mjs mcp__ --since 2026-11-05
```

It prints total calls, the Context7 share, and the sessions that used it. Run it before and after a change and "it feels like it never triggers" becomes a comparable number.

## Limitations

- **Remote dependency**: tools are unavailable offline or while Context7 is unreachable; with `failOnStartupError: true` the row reports the failure. The guidance paragraph hides itself along with the tools.
- **No OAuth**: the DSH MCP client does not implement the OAuth flow, so this bundle uses an API key or anonymous access instead of Context7's `/mcp/oauth` endpoint.
- **Data leaves the machine**: queries are sent to Context7; quotas, team policies, and billing follow the Context7 account.
- **Naming**: `serverName: context7` must be unique within one registration scope; a conflict requires renaming, which changes the tool prefix — update the guidance row's `serverName` too.
- **The core resource line misleads**: any MCP server makes DSH add a `## MCP resource servers` line pointing at `list_mcp_resources`; Context7 exposes no resources, so that path is a dead end. Core behavior, not removable by a plugin; the guidance above is how the path is pointed back at the two real tools.
- **Overlapping hand-installed skills dilute it**: installed `context7-mcp` / `find-docs` skills compete for the same trigger; delete them or rewrite them to the explicit `mcp__context7__*` names. The plugin does not write to user directories and will not delete them for you.
- **Fixed prompt cost**: the paragraph costs about 90 tokens per request; `guidance: false` turns it off.

## Uninstall

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-context7
```

or remove it from the Plugins page. The MCP client itself ships with DSH and stays.

## Development

```sh
node --test test/     # or npm test
npm run check         # syntax check for the three JS entry points
```

`index.js`'s `apply(ctx, config)` uses only two injected services (`systemPrompt`, `tools`); the tests cover registration, placement, self-hiding, renaming, and config validation with a minimal fake context.

## License

MIT. The plugin icon comes from [vscode-icons](https://github.com/vscode-icons/vscode-icons) (MIT); attribution and the full license text are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Context7 is a service by Upstash and its name and mark belong to their owner; this unofficial integration uses them only to identify the official MCP endpoint it configures.

中文: [README.md](./README.md)
