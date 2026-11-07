# dsh-context7

通过 DSH 内置的 MCP 客户端接入 [Context7](https://context7.com) 官方 MCP 服务。安装后，智能体可以先把库名解析成 Context7 library ID，再按 ID 拉取最新的文档与代码示例，而不是依赖训练数据里的旧 API。

插件由两部分组成：`cordis.patch.yml` 插入一行 `@deepseek-ai/dsh-mcp-client`，负责连接与工具；`index.js` 是一个很小的 Host 半，负责浏览器端的工具行展示，**外加一段常驻的触发引导**（见[为什么平时触发率低](#为什么平时触发率低)）。连接本身仍然全部是配置，没有自定义协议代码。

## 提供的工具

| 工具 | 说明 | 主要参数 |
| --- | --- | --- |
| `mcp__context7__resolve-library-id` | 把库名解析为 Context7 library ID（如 `/vercel/next.js`） | `libraryName`、`query` |
| `mcp__context7__query-docs` | 按 library ID 获取与问题相关的最新文档和代码示例 | `libraryId`、`query`，可选 `language` |

工具名由 `serverName: context7` 与服务端原始工具名决定；服务端改名时，工具名会随之变化。

### 对话中的展示

浏览器端半是**纯展示**的：它把这两个工具在对话里的默认工具卡片换成 Context7 标志行（`Context7 · 解析库 ID / 查询文档`），点开可看请求参数与返回的文档。工具行为、名称和结果都不变。浏览器端模块在页面启动时加载：首次安装或改动展示代码后需要**刷新页面**；若仍未生效，重启桌面端（运行中的 Host 会缓存启动时扫描到的包清单）。

## 为什么平时触发率低

装上工具不等于模型会用。在这台机器上实测（57 个会话、5,527 次 `tool/call` 事件）：两个 Context7 工具一共被调用 18 次，占 **0.33%**，其中几次还是作者自己在测试；插件安装后的 22.6 小时里，26 个会话中只有 2 个在没有提示的情况下用过它。三个原因：

1. **系统提示里没有工具名**。MCP 客户端会把 Context7 服务端返回的 `instructions` 原样贴成 `### MCP server: context7` 段落——话术很强，但从不提 `mcp__context7__*` 这两个真正可调用的名字。同一区域里唯一给出可执行步骤的是 `## MCP resource servers` 那句 `list_mcp_resources`，而 Context7 没有任何 resource（`resources: []`、`resourceTemplates: []`），那是一条死路。
2. **它排在记忆和 `web_fetch` 后面**。仓库里的 `node_modules`、`npm view`、`web_fetch` 对模型更近也更熟练：同一窗口里有 287 次 bash 读 `node_modules`、23 次 npm 查询，Context7 只有 15 次。`web_fetch` 在这条 profile 上还有 38% 的调用失败，参考价值并不稳定。
3. **手装的 skill 会分流**。`~/.agents/skills/context7-mcp` 只写不带 `mcp__` 前缀的 `resolve-library-id`；`~/.agents/skills/find-docs` 的目录描述更强势，却指向 `npx ctx7` 命令而不是这两个工具（全部会话里该命令执行 0 次）。

## 插件做的引导

`index.js` 在 MCP 客户端那条提示（`MCP_SERVERS`，顺序 3100）**之后**补一条常驻段落（顺序 3101），点名两个工具、说明该压过记忆与 `web_fetch`、并给出唯一该跳过的情形：

> For third-party library, framework, SDK, or CLI questions — setup, configuration, migration, or version-specific behavior — call `mcp__context7__resolve-library-id` and then `mcp__context7__query-docs` before answering from memory or fetching documentation with web_fetch. Skip both when the answer is in this workspace's own code or in the installed package's types.

约 360 字符（≈90 tokens），挂在整个 Host 上，因此对每个 Agent（含子代理）的每次请求生效一次。它是**自愈**的：渲染前用 `tools.get()` 查 `mcp__context7__query-docs` 是否真的注册，未注册（关闭了 `context7` 行、启动连接失败、或改了 `serverName` 却没同步这里）时返回空串，整段消失，不会留下指向不存在工具的指令。

## 环境要求

- DSH `>= 0.2.1-rc.5 < 0.3.0`（在 `0.2.1-rc.5` 与 `0.2.2-rc.1` 上验证：工具与引导段落都出现在会话里）
- 能访问 `https://mcp.context7.com/mcp`
- 仅 `scripts/usage-report.mjs` 与测试需要 Node.js 24+（内置 zstd）

## 安装

通过插件管理器安装（Web 侧边栏 **Plugins** 页面，或会话里的 `plugin_manager`）：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-context7
```

已发布到 npm，可直接按包名安装：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.2.1
```

新 bundle 通常经 HMR 直接生效；如果安装结果提示 `restart-required`，重启桌面端即可。**注意**：`index.js` 的改动属于 Host 代码，安装/更新后要重新加载插件行或重启 Host，模型才看得到新的引导段落。

## API Key（可选）

不配置 key 也能使用，Context7 会按 IP 做匿名限流。要提高额度：

```sh
# 写入 ~/.dsh/.env（或启动 DSH 的环境）
CONTEXT7_API_KEY=ctx7sk_...
```

插件在加载配置时读取该变量，只在非空时发送 `Authorization: Bearer <key>`；key 不会写入仓库或 profile 配置。修改后需要重新加载插件或重启 Host。

## 配置覆盖

默认配置见 `cordis.patch.yml`。需要调整时，在 profile 覆盖层（`$DSH_HOME/profiles/<name>/cordis.patch.yml`）按行 id 覆盖。注意 `config` 是**整体替换**，必须重述这一行需要的全部字段。

连接行 `context7`：

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

- `failOnStartupError`：这一行设为 `true`（DSH 自身的默认值是 `false`），安装/启动时连不上 Context7 会明确报失败（profile 其他插件不受影响）；希望启动完全不被远端影响时改为 `false`，交给重连策略在后台恢复。
- `toolCallTimeoutMs`：默认 `60000`。Context7 的检索较重时可以调大。
- `reconnect`：默认启用（500 ms 起指数退避，最多 10 次），可用对象覆盖。

引导行 `context7-ui`：

```yaml
- id: context7-ui
  config:
    guidance: true
    serverName: context7
```

- `guidance`：默认 `true`。设为 `false` 只关掉上面那段常驻提示，工具、展示和连接都不受影响。
- `serverName`：默认 `context7`，**必须与 `context7` 行的 `serverName` 一致**；改名后引导会自动指向新的工具名前缀，否则会因工具名对不上而自动隐藏。注意浏览器半边的展示行匹配的是写死的 `mcp__context7__` 前缀，改名后这两个工具会退回默认工具卡片（工具本身照常可用）。

## 验证

1. Plugins 页面出现 **Context7 文档查询**，其下有一行 `mcp-client`。
2. 新开一轮对话，工具列表应包含 `mcp__context7__resolve-library-id` 与 `mcp__context7__query-docs`。
3. 让智能体查询任意库的当前用法，它应先解析 library ID，再取文档。
4. 确认引导真的进了系统提示——会话日志是 zstd 压缩的 JSONL，解压后 grep 即可（需要 Node 24+）：

```sh
node -e 'const fs=require("fs"),z=require("zlib");process.stdout.write(z.zstdDecompressSync(fs.readFileSync(process.argv[1])).toString())' \
  "$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd" \
  | grep -c "mcp__context7__resolve-library-id"
```

## 使用观测

想知道它到底有没有被用起来，可以统计本机所有会话的 `tool/call`：

```sh
node scripts/usage-report.mjs                  # 默认统计 mcp__context7__
node scripts/usage-report.mjs web_             # 也可以看任何工具前缀
node scripts/usage-report.mjs mcp__ --since 2026-11-05
```

输出总调用数、占比和用过它的会话列表。改动前后各跑一次，"感觉触发少"就变成可比较的数字。

## 限制

- **依赖远端服务**：离线或 Context7 不可达时工具不可用；`failOnStartupError: true` 时该行显示失败。引导段落会随工具消失而自动隐藏。
- **不支持 OAuth**：DSH 的 MCP 客户端未实现 OAuth 流程，因此使用 API key 或匿名访问，而不是 Context7 的 `/mcp/oauth` 端点。
- **数据外发**：发送给 Context7 的查询内容会离开本机；额度、团队策略与计费以 Context7 账户为准。
- **命名冲突**：`serverName: context7` 在同一个注册作用域内必须唯一；若与其他 MCP 配置冲突，需要改名，工具前缀与引导行 `serverName` 都要同步改。
- **核心提示里的 resource 行会误导**：只要装了任何 MCP 服务器，DSH 就会加一句 `## MCP resource servers` 指向 `list_mcp_resources`；Context7 没有 resource，那句对它是死路。这是核心行为，插件删不掉，只能靠上面的引导把路径指回真正的两个工具。
- **手装的重叠 skill 会分流**：同时装 `context7-mcp` / `find-docs` 这类 skill 会稀释触发；建议删掉或改成显式写 `mcp__context7__*`。插件不写用户目录，不会替你删。
- **多一份固定开销**：引导段落每次请求约 90 tokens，可用 `guidance: false` 关掉。

## 卸载

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-context7
```

或在 Plugins 页面移除。MCP 客户端由 DSH 自带，会保留。

## 开发

```sh
node --test test/     # 或用 npm test
npm run check         # 三个 JS 入口的语法检查
```

`index.js` 的 `apply(ctx, config)` 只依赖两个注入服务（`systemPrompt`、`tools`）；测试用最小的假 context 覆盖了注册、顺序、自愈隐藏、改名与配置校验。

## 许可

MIT。插件图标来自 [vscode-icons](https://github.com/vscode-icons/vscode-icons)（MIT 许可），署名与许可全文见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。Context7 是 Upstash 提供的服务，其名称与标志属于权利人；本插件是非官方集成，仅用于标识所接入的官方 MCP 端点。

English: [README.en.md](./README.en.md)
