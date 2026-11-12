# @litingyes/dsh-github

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 GitHub 插件：**智能体拿到官方 GitHub MCP 服务的一整套工具**，**人拿到一个跟着会话工作区走的右栏页签**。查 issue、看 PR、翻通知在页签里完成；新建、合并、评论由智能体通过 `mcp__github__*` 工具执行，**写操作执行前会请求你的批准**。

令牌只填一次：页签上的按钮直接导入 GitHub CLI 已经登录的 OAuth 令牌，或者往 `$DSH_HOME/.env` 写一行 `GITHUB_TOKEN=<令牌>`。

## 它由三部分组成

1. **MCP 行** —— 把 DSH 自带的 MCP 客户端接到 `https://api.githubcopilot.com/mcp/`，工具以 `mcp__github__*` 注册。工具集用 `X-MCP-Toolsets` 限定为 `context, repos, issues, pull_requests, users, notifications`。
2. **宿主半边** —— 一段常驻引导（点名这些工具、说明仓库取自工作区 remote）、一个 `tools/pre-execute` 监听（GitHub 写工具 → `ask` 审批）、一条 `/dsh-github/*` 路由，以及令牌桥。
3. **浏览器半边** —— 右栏「GitHub」页签：仓库概览、issue / pull request / 通知三个列表、详情、评论框、关闭 / 重新打开 / 合并。

本插件**不注册自己的智能体工具**：工具是 MCP 行的，这个包提供的是界面与护栏。

## 智能体这一侧

工具名全部来自 GitHub 官方 MCP 服务，按工具集划分（默认只开下列几组）：

| 工具集 | 典型工具 | 用途 |
| --- | --- | --- |
| `context` | `get_me`、`get_teams` | 当前身份与权限 |
| `repos` | `search_repositories`、`get_file_contents`、`list_commits` | 仓库、文件、提交 |
| `issues` | `list_issues`、`issue_read`、`issue_write`、`add_issue_comment` | issue 的读取与修改 |
| `pull_requests` | `list_pull_requests`、`pull_request_read`、`create_pull_request`、`merge_pull_request`、`pull_request_review_write` | PR 与评审 |
| `users` | `search_users` | 用户检索 |
| `notifications` | `list_notifications` | 通知 |

想放宽或收窄，改 `cordis.patch.yml` 里的 `X-MCP-Toolsets`；想整机只读，再加一行 `X-MCP-Readonly: 'true'`（这一项由 GitHub 服务端强制，优先于任何工具集设置）。

## 人这一侧：右栏「GitHub」页签

页签属于当前会话，所以它显示的是**这个会话工作区所在的仓库**：

- 顶部是仓库身份：`owner/repo`、私有标记、描述、star / fork 数、默认分支、当前登录账号。
- 三个列表：issue（可切「打开 / 已关闭」并筛「指派给我 / 我创建的」）、pull request（打开 / 已关闭，显示 `head → base`）、通知（仅本仓库）。
- 点一行进入详情：正文、标签、评论、评论框，以及关闭 / 重新打开 / 合并。合并与关闭会先弹确认框，框里写明是哪个编号。
- 列表分页：`Link` 头里有 `rel="next"` 才出现「加载更多」。
- 工作区没有 GitHub remote 时，页签给一个输入框，手输 `owner/repo` 继续浏览（只存在于当前面板，不落盘）。

页签自己的人发起的写操作（评论、建 issue、关闭、合并）只在你点了按钮、并在确认框里确认后发生；**智能体的写操作走 DSH 审批**，两条路径在各自的入口就被分开。

## 令牌

只认一个来源：DSH 凭据库里的 `GITHUB_TOKEN`。写入它有两条路：

1. **页签上的「从 gh 导入令牌」** —— 执行 `gh auth token`，先用 `GET /user` 验证令牌有效（无效就不覆盖已有的），再写进凭据库，并显示登录名与 scope。
2. **`$DSH_HOME/.env` 里写 `GITHUB_TOKEN=…`** —— 适用于自建 PAT。最小权限：只读用 `public_repo`，要读写私有仓库用 `repo`。

MCP 行用 `Authorization: 'Bearer ${credential:GITHUB_TOKEN}'` 引用它（`expandTemplates: true`）：令牌值会被诊断日志脱敏；没有令牌时这一行停在 `waiting-credentials` 而不拖垮 Host；凭据一更新，连接自动重建，不必重启。

### 为什么不是 OAuth 授权流程

GitHub 的 MCP 端点确实支持 OAuth，实测：

- 裸请求返回 `401`，带 `www-authenticate: Bearer … resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"`；
- 该 metadata 指向授权服务器 `https://github.com/login/oauth`；
- 但 `https://github.com/login/oauth/.well-known/oauth-authorization-server` 是 `404` —— **没有授权服务器元数据，也没有动态客户端注册**。

也就是说，第三方包无法像 MCP 规范假设的那样自注册 client_id，要实现 OAuth 就得自带一个已注册 GitHub OAuth App 的 client_secret，开源 npm 包里这样做不可接受。而 DSH 的 `@deepseek-ai/dsh-mcp-client` 本身不实现 MCP OAuth（它只设置请求头）。两条路都堵着，于是选择第三条：`gh` 是已注册的客户端，它的令牌是 OAuth 令牌、由 gh 刷新，实测能直接开通该端点——把它桥进凭据库，得到的是同一个 `Authorization: Bearer`。

在支持 MCP OAuth 的客户端里，只写 `{"type":"http","url":"https://api.githubcopilot.com/mcp/"}` 就能用；在 DSH 里，这一段的等价物就是上面那个导入按钮。

## 安装

```text
plugin_manager action=install_bundle target=@litingyes/dsh-github@0.1.0
```

或以目录方式装本仓库：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-github
```

装好后新开一个会话，右栏会多出「GitHub」页签。第一次打开如果提示没有令牌，点「从 gh 导入令牌」即可（本机需先 `gh auth login`）。

## 配置

改 profile 补丁层里 `id: github` 的那行（或 `id: github-mcp` 的那行）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `serverName` | `github` | MCP 行的 `serverName`，也是工具名前缀；两行必须一致 |
| `guidance` | `true` | 是否注册常驻引导段落（工具不在时自动为空） |
| `approval` | `true` | 是否注册写操作审批监听 |
| `approvalTools` | `[]` | 额外强制审批的工具裸名（不带前缀） |
| `skipApprovalTools` | `[]` | 免审批的例外 |
| `credentialRef` | `GITHUB_TOKEN` | 凭据名；必须与 MCP 行 `${credential:…}` 里的名字一致 |
| `ghCommand` | `gh` | 导入令牌时执行的命令 |
| `apiBase` | `https://api.github.com` | GitHub Enterprise 换这个；注意 remote 解析目前只认 `github.com` |
| `maxItems` | `30` | 每页条数（10–100） |
| `cacheMs` | `60000` | 仓库概览的缓存时长（0–600000） |
| `requestTimeoutMs` | `15000` | 单次 GitHub 请求超时（1000–60000） |
| `panelWrites` | `true` | 关掉后页签只读（智能体的写操作不受影响，仍走审批） |

## 审批

`tools/pre-execute` 里，凡是以 `mcp__<serverName>__` 开头、且被判为写工具的名字，都会返回 `ask`，由 DSH 的审批服务决定：批准才执行，拒绝就返回拒绝原因。

写工具的判定只看名字（MCP 客户端不传递 `readOnlyHint` 注解）：

- **首段是动词**：`create_*`、`update_*`、`merge_*`、`add_*`、`push_*`、`delete_*`、`assign_*`、`request_*`、`dismiss_*`、`mark_*`、`set_*`、`submit_*`、`fork_*`、`lock_*`、`unlock_*`、`remove_*`、`reopen_*`；
- **末段是 `write` 或 `trigger`**：`issue_write`、`label_write`、`pull_request_review_write`、`actions_run_trigger`。

这样 `pull_request_read`、`get_me`、`list_commits`、`search_code` 这类读工具不会误伤。GitHub 若新增了用别的方式命名的写工具，用 `approvalTools` 补上。

## 限制

- **只支持 `github.com`**。`apiBase` 可以指向 GitHub Enterprise，但工作区 remote 的解析白名单是常量，GHES 的 remote 会被判成 `not_github`。
- **页签不轮询**。数据在你打开、切换、点刷新或写操作成功后读取；后台不会自己变。
- **不做通知已读**。列表只读，`PATCH /notifications` 没有接到界面上。
- **没有浮动计数徽标**。三个列表的分页靠 `Link` 头，不额外请求总数。
- **PR 的检查与评审细节**交给已装的 forge 面板（`@deepseek-ai/dsh-experimental-forge-bundle`，走 `gh` CLI）；本插件的 PR 视图是只读汇总加合并。
- **令牌落在你的机器上**。`gh` 导入的令牌写进 DSH 凭据库（`$DSH_HOME` 下，0600 权限），`.env` 里的 PAT 同理；请求带令牌直连 GitHub，不经过任何中转。
- **插件不做 `gh` 命令转发**：`gh` 只在导入令牌时被调用一次。

## 开发

```bash
npm install          # 只有 esbuild 一个开发依赖
npm run build        # 从 src/client/ 重建 client.js（产物要提交）
npm test             # node --test test/
npm run check        # 校验产物新鲜度 + 语法
```

宿主半边（`index.js` / `github.js` / `auth.js` / `api.js`）零第三方依赖，只用 `node:` 内置模块与全局 `fetch`。浏览器半边除 `react` / `react-dom` / `react/jsx-runtime` 外不得 external，构建脚本会断言这一点。

## 卸载

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-github
```

卸载后 `mcp__github__*` 工具与右栏页签一起消失；已写入凭据库的 `GITHUB_TOKEN` 不会被删除，需要的话用 `ctx.credentials.unset` 或直接编辑 `$DSH_HOME/.env`。

## 许可

MIT。见 [LICENSE](./LICENSE)。
