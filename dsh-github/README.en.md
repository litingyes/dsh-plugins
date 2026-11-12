# @litingyes/dsh-github

GitHub for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): **the agent gets the official GitHub MCP server's whole tool set**, and **you get a right-sidebar tab that follows the Session's workspace**. Browse issues, pull requests and notifications in the tab; creating, merging and commenting run through the agent's `mcp__github__*` tools, and **every write asks for your approval first**.

You configure a token once: the tab's import button copies the OAuth token the GitHub CLI already holds, or you put `GITHUB_TOKEN=<token>` in `$DSH_HOME/.env`.

## Three parts

1. **The MCP row** — points the DSH-shipped MCP client at `https://api.githubcopilot.com/mcp/`, so tools register as `mcp__github__*`. `X-MCP-Toolsets` narrows the catalogue to `context, repos, issues, pull_requests, users, notifications`.
2. **The Host half** — an always-on prompt section that names those tools and says where the repository comes from, a `tools/pre-execute` listener that turns GitHub write tools into `ask` approvals, the `/dsh-github/*` route the panel reads, and the token bridge.
3. **The browser half** — the right-sidebar GitHub tab: repository overview, three lists, a detail view with comments, and close / reopen / merge.

This package registers **no agent tools of its own**: the tools are the MCP row's, and the plugin contributes the surface and the guardrail.

## The agent side

Every tool name comes from GitHub's own MCP server. The default tool sets and what they cover:

| Tool set | Typical tools | Purpose |
| --- | --- | --- |
| `context` | `get_me`, `get_teams` | who you are and what you may do |
| `repos` | `search_repositories`, `get_file_contents`, `list_commits` | repositories, files, commits |
| `issues` | `list_issues`, `issue_read`, `issue_write`, `add_issue_comment` | reading and changing issues |
| `pull_requests` | `list_pull_requests`, `pull_request_read`, `create_pull_request`, `merge_pull_request`, `pull_request_review_write` | pull requests and reviews |
| `users` | `search_users` | user lookup |
| `notifications` | `list_notifications` | notifications |

To widen or narrow the list, change `X-MCP-Toolsets` in `cordis.patch.yml`. To make the whole server read-only, add `X-MCP-Readonly: 'true'` — the server enforces it, and it outranks any tool-set setting.

## The human side: the right-sidebar GitHub tab

The tab belongs to the Session on screen, so it shows **that Session's workspace repository**:

- Repository identity at the top: `owner/repo`, private marker, description, stars and forks, default branch, the signed-in account.
- Three lists: issues (open / closed, plus assigned-to-me and created-by-me), pull requests (open / closed, showing `head → base`), and notifications (this repository only).
- A row opens the detail: body, labels, comments, a comment box, and close / reopen / merge. Merge and close ask first, in a dialog that names the number.
- Paging appears as "Load more" only when GitHub's `Link` header carries `rel="next"`.
- A workspace without a GitHub remote still gets a panel: type `owner/repo` and it browses that one, for the life of the panel and nowhere else.

Writes you start in the panel (comment, new issue, close, merge) happen when you press the button and confirm the dialog. **The agent's writes go through the DSH approval prompt.** The two paths stay apart at their own entry points.

## The token

One source: `GITHUB_TOKEN` in the DSH credential store. Two ways to fill it:

1. **"Import the gh token" in the tab** — runs `gh auth token`, verifies it with `GET /user` (a revoked token never overwrites a working one), stores it, and reports the login and scopes.
2. **`GITHUB_TOKEN=…` in `$DSH_HOME/.env`** — for a hand-made PAT. Minimal scopes: `public_repo` to read, `repo` to read and write private repositories.

The MCP row references it as `Authorization: 'Bearer ${credential:GITHUB_TOKEN}'` with `expandTemplates: true`: the resolved value is redacted from diagnostics, a missing token parks the row in `waiting-credentials` instead of failing the Host, and a credential update rebuilds the connection without a restart.

### Why not an OAuth flow

GitHub's MCP endpoint does support OAuth. Measured against the live endpoint:

- a bare request answers `401` with `www-authenticate: Bearer … resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"`;
- that metadata names the authorization server `https://github.com/login/oauth`;
- but `https://github.com/login/oauth/.well-known/oauth-authorization-server` is `404` — **no authorization-server metadata and no dynamic client registration**.

A third-party package therefore cannot register itself the way the MCP specification assumes; implementing OAuth would mean shipping a registered GitHub OAuth App's client secret inside an open-source npm package. DSH's `@deepseek-ai/dsh-mcp-client` implements no MCP OAuth either — it only sets request headers. With both doors shut, the plugin takes a third route: `gh` is a registered client, its token is an OAuth token refreshed by `gh`, and it authenticates that endpoint. Bridging it into the credential store yields the same `Authorization: Bearer` the specification wants.

In clients that implement MCP OAuth, `{"type":"http","url":"https://api.githubcopilot.com/mcp/"}` is enough. In DSH, the import button is the equivalent of that.

## Install

```text
plugin_manager action=install_bundle target=@litingyes/dsh-github@0.1.0
```

Or from this repository as a directory:

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-github
```

Open a new Session afterwards and the right sidebar offers the GitHub tab. If it says no token is configured, press "Import the gh token" (the machine needs `gh auth login` first).

## Configuration

Edit the `id: github` row (or `id: github-mcp`) in the profile patch layer:

| Field | Default | Meaning |
| --- | --- | --- |
| `serverName` | `github` | the MCP row's name and the tool prefix; both rows must agree |
| `guidance` | `true` | register the always-on prompt section (empty while the tools are absent) |
| `approval` | `true` | register the write-approval listener |
| `approvalTools` | `[]` | extra bare tool names that always ask |
| `skipApprovalTools` | `[]` | exceptions that never ask |
| `credentialRef` | `GITHUB_TOKEN` | credential name; must match the MCP row's `${credential:…}` |
| `ghCommand` | `gh` | command used by the import button |
| `apiBase` | `https://api.github.com` | GitHub Enterprise changes this; remote parsing still accepts `github.com` only |
| `maxItems` | `30` | page size (10–100) |
| `cacheMs` | `60000` | how long the repository overview is reused (0–600000) |
| `requestTimeoutMs` | `15000` | per-request budget (1000–60000) |
| `panelWrites` | `true` | `false` makes the tab read-only; the agent's writes still go through approval |

## Approval

In `tools/pre-execute`, any name that starts with `mcp__<serverName>__` and classifies as a write returns `ask`, which the approval service turns into a prompt: approved once, it runs; refused, it fails with the reason.

Classification reads the name only, because the MCP client keeps no `readOnlyHint` annotation:

- **a leading verb**: `create_*`, `update_*`, `merge_*`, `add_*`, `push_*`, `delete_*`, `assign_*`, `request_*`, `dismiss_*`, `mark_*`, `set_*`, `submit_*`, `fork_*`, `lock_*`, `unlock_*`, `remove_*`, `reopen_*`;
- **a trailing `write` or `trigger`**: `issue_write`, `label_write`, `pull_request_review_write`, `actions_run_trigger`.

That leaves `pull_request_read`, `get_me`, `list_commits` and `search_code` on the read side. If GitHub ships a writer named some other way, add it to `approvalTools`.

## Limits

- **`github.com` only.** `apiBase` may point at GitHub Enterprise, but the remote-host allowlist is a constant, so a GHES remote is reported as `not_github`.
- **The tab does not poll.** Data is read when you open it, switch lists, refresh, or finish a write; nothing changes behind your back.
- **No marking notifications read.** The list is read-only; `PATCH /notifications` is not wired to the UI.
- **No floating count badges.** Paging uses the `Link` header instead of a separate count request.
- **Pull request checks and reviews** belong to the forge panel that ships with DSH (`@deepseek-ai/dsh-experimental-forge-bundle`, via the `gh` CLI); this plugin's PR view is a read-only summary plus merge.
- **The token lives on your machine.** An imported `gh` token is written to the DSH credential store under `$DSH_HOME` (mode 0600), as is a PAT in `.env`; requests carry it straight to GitHub with no proxy.
- **No `gh` passthrough.** `gh` is invoked exactly once, when you import its token.

## Development

```bash
npm install          # esbuild is the only development dependency
npm run build        # rebuild client.js from src/client/ (the artifact is committed)
npm test             # node --test test/
npm run check        # artifact freshness + syntax
```

The Host half (`index.js`, `github.js`, `auth.js`, `api.js`) has no third-party dependency: `node:` built-ins and the global `fetch` only. The browser half may externalize nothing but `react`, `react-dom` and `react/jsx-runtime`, and the build script asserts it.

## Uninstall

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-github
```

The `mcp__github__*` tools and the tab disappear together. The stored `GITHUB_TOKEN` stays; remove it with `ctx.credentials.unset` or by editing `$DSH_HOME/.env`.

## License

MIT. See [LICENSE](./LICENSE).
