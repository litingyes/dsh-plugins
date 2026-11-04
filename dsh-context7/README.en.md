# dsh-context7

Connects the official [Context7](https://context7.com) MCP server to DeepSeek Harness through the DSH-shipped MCP client. The agent can resolve a library name to a Context7 library ID and then fetch current documentation and code examples instead of relying on stale training data.

This is a **configuration-only bundle**: it ships no runtime code and inserts one `@deepseek-ai/dsh-mcp-client` row.

## Tools

| Tool | Purpose | Main parameters |
| --- | --- | --- |
| `mcp__context7__resolve-library-id` | Resolve a library name to a Context7 library ID (for example `/vercel/next.js`) | `libraryName`, `query` |
| `mcp__context7__query-docs` | Fetch current documentation and code examples for a library ID | `libraryId`, `query`, optional `language` |

Names come from `serverName: context7` plus the server's own tool names; they change if Context7 renames a tool.

### Conversation presentation

The bundle also carries a **presentation-only** browser half: it replaces the generic tool card for these two tools with a Context7 mark row (`Context7 · Resolve library / Query docs`), expandable to the request and the returned documentation. Tool behavior, names, and results are unchanged. The browser module loads when the page starts: after the first install or a presentation change, **refresh the page**; if the row still does not change, restart the desktop app (the running Host caches the package manifests it scanned at startup).

## Requirements

- DSH `>= 0.2.1-rc.5 < 0.3.0` (verified on `0.2.1-rc.5`)
- Network access to `https://mcp.context7.com/mcp`

## Install

Install through the plugin manager (the Web **Plugins** page or the `plugin_manager` tool in a session):

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-context7
```

Once published to npm:

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.1.0
```

A new bundle normally activates through HMR; if the result reports `restart-required`, restart the desktop app.

## API key (optional)

Context7 works without a key under an anonymous, IP-based rate limit. For higher limits:

```sh
# ~/.dsh/.env or the environment that launches DSH
CONTEXT7_API_KEY=ctx7sk_...
```

The plugin reads the variable while loading its config and sends `Authorization: Bearer <key>` only when it is non-blank, so the key never lives in this repository or a profile config. Reload the plugin or restart the Host after changing it.

## Configuration overrides

Defaults live in `cordis.patch.yml`. To change them, override the row id `context7` in the profile patch layer (`$DSH_HOME/profiles/<name>/cordis.patch.yml`). A row override replaces `config` **wholesale**, so restate every field the row needs:

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

## Verify

1. The Plugins page shows **Context7 Documentation** with an `mcp-client` row.
2. A new turn exposes `mcp__context7__resolve-library-id` and `mcp__context7__query-docs`.
3. Ask the agent about any library; it should resolve the library ID first and then fetch documentation.

## Limitations

- **Remote dependency**: tools are unavailable offline or while Context7 is unreachable; with `failOnStartupError: true` the row reports the failure.
- **No OAuth**: the DSH MCP client does not implement the OAuth flow, so this bundle uses an API key or anonymous access instead of Context7's `/mcp/oauth` endpoint.
- **Data leaves the machine**: queries are sent to Context7; quotas, team policies, and billing follow the Context7 account.
- **Naming**: `serverName: context7` must be unique within one registration scope; a conflict requires renaming, which changes the tool prefix.

## Uninstall

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-context7
```

or remove it from the Plugins page. The MCP client itself ships with DSH and stays.

## License

MIT. The plugin icon comes from [vscode-icons](https://github.com/vscode-icons/vscode-icons) (MIT); attribution and the full license text are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Context7 is a service by Upstash and its name and mark belong to their owner; this unofficial integration uses them only to identify the official MCP endpoint it configures.

中文: [README.md](./README.md)
