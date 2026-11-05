# @litingyes/dsh-git

A Git panel for DeepSeek Harness that **opens in the right sidebar and follows the Session's workspace**: **a multi-branch commit graph as the primary view**, where every node shows its description, author, date, and commit and expands into full details — beside staging, committing, and branch and worktree management. The panel is the only surface: 0.3.0 no longer registers agent tools.

> Reads and writes local Git repositories only. No network operations: no fetch, pull, push, or clone.

## The panel

Open the right sidebar's add control, pick **Workspace Git** in the guide, and the panel appears as a right-sidebar tab (each Session remembers its own tab layout). There is no workspace picker: the tab shows **the Session's own workspace**, so switching Sessions switches repositories.

The right sidebar is narrow, so the panel lays out against **its own width**, not the window: branch and file rows use a two-part layout, so trailing actions and badges are never clipped at the right edge; one column when squeezed, ellipsizing what can be omitted and wrapping what cannot, with no horizontal scrollbar. Open the sidebar fullscreen and the Changes tab returns to its two-column split.

Inside the panel there are three tabs.

### Graph (default)

- Every local and remote branch is walked in `--date-order` and drawn as parallel lanes, so branch lines stay distinguishable at a glance.
- One row per commit:

  | Where | What |
  | --- | --- |
  | Left gutter | Fork, merge, and advance lines plus the commit dot |
  | Middle | The commit description (subject) and the branch/tag badges pointing at it |
  | Right | author · relative date · short SHA |

- **Click a node to expand it**: full commit message, author and committer, absolute and relative times, parents, every ref, and the changed-file list with status letters and `+/-` counts. Click a file to see that file's diff inside that commit.
- The toolbar toggles "current branch only" / "all branches", searches by subject, author, or SHA, and refreshes.

### Changes

- Staged, unstaged, untracked, and conflicted groups; select a file or a whole group and stage, unstage, or discard.
- The selected file's diff sits beside the list (two columns when wide, stacked when narrow) with added and removed lines tinted from the theme's success and error tokens.
- Commit box at the bottom: write a message and commit. It stays disabled while nothing is staged or the message is empty; `Cmd/Ctrl+Enter` submits.
- **Discard** opens a confirmation dialog first; only the confirmed request carries `confirm: true`, and the Host checks it again.

### Branches

- Local branches with the current marker, upstream, and last-commit time, each with a one-click switch.
- A branch already checked out in a worktree cannot be switched again: the row is badged "worktree" and its switch is disabled (git refuses a second checkout).
- Create-and-switch, with the name validated by `git check-ref-format --branch`.
- Remote branches listed below.
- **Worktree list**: every worktree of the repository — path (relative inside the repository, `~`-abbreviated outside when possible), branch, short HEAD, plus current / locked / prunable badges.
- **Create a worktree**: fill in a branch and a path, then either create the branch (`git worktree add -b`) or check out an existing one; the default path is `<workspace root>/.agents/worktrees/<branch>` (usually the repository root; relative paths resolve against the workspace root) and can be edited.
- If the default `.agents/worktrees/` container has no `.gitignore` yet, creating a worktree writes a single `*` line there (the same marker the agent's worktree tool writes); without it the new worktree would show up as untracked in the main repository.
- **Remove a worktree**: requires a second confirmation; ticking "force" discards uncommitted changes in that worktree.
- **Prune**: appears only while a prunable entry exists, and cleans up stale registrations whose directory is gone.
- The panel never moves the Session's directory: you enter a new worktree yourself (open a Session in the new directory); it always reads and writes the root repository of the registered workspace.

## Install

The plugin is a Cordis bundle. Install it with the DSH plugin manager; never hand-edit the profile's `package.json` or `cordis.patch.yml`:

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-git
```

Once published to npm:

```text
plugin_manager action=install_bundle target=@litingyes/dsh-git@0.3.0
```

There is no left-sidebar icon: the way in is the right sidebar's add control. The Host half (`index.js` / `git.js` / `api.js`) is imported by the Loader at startup, so **restart DSH after upgrading**. Remove it with `plugin_manager action=remove_bundle target=@litingyes/dsh-git`.

### Requirements

- DSH `>= 0.2.1-rc.5 < 0.3.0-0` with a right sidebar in the composition (`@deepseek-ai/dsh-client-ui-sidebar-right`). Without it the plugin stays silently absent instead of failing.
- A working `git` on `PATH` (the plugin calls it through `execFile`, never a shell).
- The Session's working directory must sit inside a registered DSH workspace. A Session with no directory, or one outside every workspace, gets the matching empty state or error.

## Configuration

Configuration lives on the mount row in `cordis.patch.yml`. **Overriding the row replaces `config` wholesale**, so restate every field. Invalid values fail loudly at mount instead of degrading at request time.

> 0.3.0 removed the four agent tools (`git_status` / `git_diff` / `git_commit` / `git_branch`) along with the `tools` and `defaultWorkspaceId` fields. Legacy keys left in a profile patch are ignored, not rejected.

| Field | Default | Meaning |
| --- | --- | --- |
| `refs` | `all` | `all` walks every branch; `head` walks only the current branch's history |
| `maxCommits` | `200` | Commits fetched for the graph, 20–500 |
| `maxDiffBytes` | `400000` | Byte budget for one patch sent to the browser, 10 KB–2 MB; larger patches are truncated and announced |
| `commandTimeoutMs` | `15000` | Timeout for one git invocation, 500–120000 |

## Security model

- **Workspace allowlist**: the browser can name only a workspace id, or one Session working directory; the latter must sit inside a registered workspace path before the Host adopts it, and git always runs with the registered path as its cwd — a browser-supplied absolute path is never used directly.
- **No shell**: `execFile('git', args)` with one argument per array entry, so a branch name, path, or commit message can never be reinterpreted as syntax.
- **Path validation**: every path that reaches a git command passes `assertRelativePath`, which refuses empty strings, absolute paths, `..` segments, and NUL bytes.
- **Worktree path validation**: a new path must sit inside the registered workspace root, outside `.git`, and not exist yet; removal accepts only paths listed by that repository's `git worktree list`, and never touches the main or current worktree.
- **Authorisation first**: the route runs `connection.requestRejection(req)` before anything else and returns no registry contents when it fails.
- **Destructive work needs two confirmations**: discarding changes and removing a worktree both require the dialog and `confirm: true` on the request; discarding additionally re-reads status to prove the path is actually changed.
- **Failures stay visible**: non-zero git exits, timeouts, and `index.lock` conflicts come back as a structured code plus git's own first error line.

## Limits

- No network operations: no fetch, pull, push, or clone.
- The panel does not move the Session's directory: a new worktree is only a directory on disk — enter it (or open a Session there) yourself.
- No stash, rebase, merge, cherry-pick, or conflict resolution.
- At most 500 commits and 400 changed files per response.
- More than eight lanes are folded with a notice instead of widening the graph.
- Lane colours are a fixed eight-hue palette (data encoding); everything else comes from host theme tokens.

## Development

```bash
npm install          # esbuild and @base-ui-components/react only
npm run build        # src/client/* -> client.js (esbuild + module-loader envelope)
npm test             # node --test test/
npm run check        # node --check on the four runtime entry points
```

- The Host half (`index.js`, `git.js`, `api.js`) is dependency-free ESM using only `node:` built-ins, and needs no build.
- The browser half is built from `src/client/`, and `client.js` **must be committed**: `install_bundle` only links the directory and never builds inside the profile.
- The build asserts that the bundle's only external modules are `react`, `react-dom`, and `react/jsx-runtime` — those three come from the Web UI's shared module table, and everything else (Base UI included) must be compiled in.

Directory:

```
dsh-git/
├── index.js               # Host entry: config validation and route wiring
├── git.js                 # git execution, parsing, and the single implementation
├── api.js                 # /dsh-git/api/* routes and authorisation
├── client.js              # built browser half
├── scripts/build-client.mjs
├── src/shared/graph.js    # commit-graph lane layout (pure, shared)
├── src/client/            # React + Base UI views
└── test/                  # node --test: layout, parsers, real repo, HTTP
```

## Licence and third parties

Code is MIT; see [`LICENSE`](./LICENSE). The icon is the Git logo (Jason Long, CC BY 3.0, distributed via devicon), and the browser half bundles Base UI (MIT). Full attribution is in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
