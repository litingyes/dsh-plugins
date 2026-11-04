# dsh-context7

通过 DSH 内置的 MCP 客户端接入 [Context7](https://context7.com) 官方 MCP 服务。安装后，智能体可以先把库名解析成 Context7 library ID，再按 ID 拉取最新的文档与代码示例，而不是依赖训练数据里的旧 API。

这是一个**纯配置型 bundle**：没有运行时代码，只插入一行 `@deepseek-ai/dsh-mcp-client` 配置。

## 提供的工具

| 工具 | 说明 | 主要参数 |
| --- | --- | --- |
| `mcp__context7__resolve-library-id` | 把库名解析为 Context7 library ID（如 `/vercel/next.js`） | `libraryName`、`query` |
| `mcp__context7__query-docs` | 按 library ID 获取与问题相关的最新文档和代码示例 | `libraryId`、`query`，可选 `language` |

工具名由 `serverName: context7` 与服务端原始工具名决定；服务端改名时，工具名会随之变化。

### 对话中的展示

插件还带一个**纯展示**的浏览器端半：它把这两个工具在对话里的默认工具卡片换成 Context7 标志行（`Context7 · 解析库 ID / 查询文档`），点开可看请求参数与返回的文档。工具行为、名称和结果都不变。浏览器端模块在页面启动时加载：首次安装或改动展示代码后需要**刷新页面**；若仍未生效，重启桌面端（运行中的 Host 会缓存启动时扫描到的包清单）。

## 环境要求

- DSH `>= 0.2.1-rc.5 < 0.3.0`（当前在 `0.2.1-rc.5` 上验证）
- 能访问 `https://mcp.context7.com/mcp`

## 安装

通过插件管理器安装（Web 侧边栏 **Plugins** 页面，或会话里的 `plugin_manager`）：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-context7
```

发布到 npm 之后也可以按包名安装：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.1.0
```

新 bundle 通常经 HMR 直接生效；如果安装结果提示 `restart-required`，重启桌面端即可。

## API Key（可选）

不配置 key 也能使用，Context7 会按 IP 做匿名限流。要提高额度：

```sh
# 写入 ~/.dsh/.env（或启动 DSH 的环境）
CONTEXT7_API_KEY=ctx7sk_...
```

插件在加载配置时读取该变量，只在非空时发送 `Authorization: Bearer <key>`；key 不会写入仓库或 profile 配置。修改后需要重新加载插件或重启 Host。

## 配置覆盖

默认配置见 `cordis.patch.yml`。需要调整时，在 profile 覆盖层（`$DSH_HOME/profiles/<name>/cordis.patch.yml`）按行 id `context7` 覆盖。注意 `config` 是**整体替换**，必须重述这一行需要的全部字段：

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

- `failOnStartupError`：默认 `true`，安装/启动时连不上 Context7 会明确报失败（profile 其他插件不受影响）；希望启动完全不被远端影响时改为 `false`，交给重连策略在后台恢复。
- `toolCallTimeoutMs`：默认 `60000`。Context7 的检索较重时可以调大。
- `reconnect`：默认启用（500 ms 起指数退避，最多 10 次），可用对象覆盖。

## 验证

1. Plugins 页面出现 **Context7 文档查询**，其下有一行 `mcp-client`。
2. 新开一轮对话，工具列表应包含 `mcp__context7__resolve-library-id` 与 `mcp__context7__query-docs`。
3. 让智能体查询任意库的当前用法，它应先解析 library ID，再取文档。

## 限制

- **依赖远端服务**：离线或 Context7 不可达时工具不可用；`failOnStartupError: true` 时该行显示失败。
- **不支持 OAuth**：DSH 的 MCP 客户端未实现 OAuth 流程，因此使用 API key 或匿名访问，而不是 Context7 的 `/mcp/oauth` 端点。
- **数据外发**：发送给 Context7 的查询内容会离开本机；额度、团队策略与计费以 Context7 账户为准。
- **命名冲突**：`serverName: context7` 在同一个注册作用域内必须唯一；若与其他 MCP 配置冲突，需要改名，工具前缀也会随之变化。

## 卸载

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-context7
```

或在 Plugins 页面移除。MCP 客户端由 DSH 自带，会保留。

## 许可

MIT。插件图标来自 [vscode-icons](https://github.com/vscode-icons/vscode-icons)（MIT 许可），署名与许可全文见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。Context7 是 Upstash 提供的服务，其名称与标志属于权利人；本插件是非官方集成，仅用于标识所接入的官方 MCP 端点。

English: [README.en.md](./README.en.md)
