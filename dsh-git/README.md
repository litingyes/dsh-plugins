# @litingyes/dsh-git

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Git 面板：**开在右侧栏里，跟着当前会话的工作区走**。以多分支提交树为主视图，节点显示 description / author / date / commit，点开看提交详情；旁边是变更暂存、提交与分支管理。同一套操作也以工具形式提供给智能体。

> 只读写本机的 Git 仓库，不做任何网络操作（没有 fetch / pull / push）。

## 界面

在右侧栏点「+」打开起始页，选 **工作区 Git**，它作为一个右栏页签出现（每个会话各自记住自己的页签布局）。面板不让你选工作区：它显示的就是**当前会话工作区**的仓库，切换会话即切换仓库。

右栏很窄，面板按**容器宽度**而不是窗口宽度排版：窄时单列、该省略的省略、该换行的换行，不会出现横向滚动条；把右栏切成全屏（右侧栏的展开按钮）后，变更页会自动回到左右两栏。

面板内分三个页签：

### 提交图（默认）

- 按 `--date-order` 展开**所有本地与远程分支**的提交，泳道并排显示，分支线一眼可辨。
- 每个节点一行显示：

  | 位置 | 内容 |
  | --- | --- |
  | 左侧泳道 | 分叉、合并、分支推进的连线与节点圆点 |
  | 主题 | 提交 description（subject）+ 指向该提交的分支/标签徽标 |
  | 右侧 | author · 相对日期 · 短 SHA |

- **点击节点展开详情**：完整 commit message、author 与 committer、绝对/相对时间、父提交、全部 refs、变更文件列表（状态字母 + `+/-` 行数）；再点某个文件即可看该文件在该提交中的 diff。
- 工具行提供「仅当前分支 / 全部分支」切换、提交搜索（subject / author / SHA）与刷新。

### 变更

- 已暂存 / 未暂存 / 未跟踪 / 冲突四组，逐文件或整组勾选，按钮执行「暂存 / 取消暂存 / 丢弃」。
- 选中文件在右侧看 diff（宽屏两栏，窄屏上下堆叠），新增/删除行按主题的成功/错误色高亮。
- 底部提交框：填信息后「提交」；已暂存为空或信息为空时禁用；`Cmd/Ctrl+Enter` 快捷提交。
- 「丢弃」会先弹确认框，确认后才带 `confirm: true` 请求 Host，Host 还会再校验一次。

### 分支

- 本地分支列表（当前分支标记、上游、最近提交时间），一键切换。
- 新建分支并切换；分支名交给 `git check-ref-format --branch` 校验。
- 折叠显示远程分支。

## 安装

插件是一个 Cordis bundle，用 DSH 的插件管理器安装，**不要手改** profile 的 `package.json` 或 `cordis.patch.yml`：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-git
```

已发布到 npm，可按包名安装：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-git@0.2.0
```

安装后左侧栏不再有 Git 图标：入口在右侧栏「+」的起始页里。Host 半边（`git.js` / `api.js`）由 Loader 在启动时载入，**升级后需要重启 DSH** 才生效。卸载：`plugin_manager action=remove_bundle target=@litingyes/dsh-git`。

### 前提

- DSH `>= 0.2.1-rc.5 < 0.3.0-0`，且组合里有右侧栏（`@deepseek-ai/dsh-client-ui-sidebar-right`）。缺少它时插件静默不出现，不会报错。
- 本机 `PATH` 上有可用的 `git`（插件用 `execFile` 直接调用，不经过 shell）。
- 当前会话的工作目录要落在某个已注册的 DSH 工作区内。会话没有工作目录、或目录在工作区之外时，面板会给出对应的空态/错误提示。

## 配置

配置写在 `cordis.patch.yml` 的挂载行里；**覆盖这一行会整体替换 `config`**，需要重述所有字段。非法值会在挂载时直接报错，不会静默降级。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `defaultWorkspaceId` | `''` | 智能体工具省略 `workspace` 时用哪个工作区；空 = 最近更新的已注册工作区。面板按会话解析，不受它影响 |
| `refs` | `all` | `all` = 提交图追踪全部分支；`head` = 只追踪当前分支 |
| `maxCommits` | `200` | 提交图抓取的提交数，20–500 |
| `maxDiffBytes` | `400000` | 单个补丁返回给浏览器的字节上限，10KB–2MB，超出截断并提示 |
| `commandTimeoutMs` | `15000` | 单次 git 调用的超时，500–120000 |
| `tools` | `true` | 是否注册四个智能体工具；`false` 时只保留面板 |

## 智能体工具

四个工具与面板调用同一个 Host 服务，行为完全一致：

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `git_status` | `workspace?`, `refs?`, `limit?` | 分支与领先/落后、四类变更文件、跨分支最近提交、本地分支 |
| `git_diff` | `target` (`worktree`\|`index`\|`commit`), `workspace?`, `path?`, `commit?` | 一个统一 diff；二进制与超大补丁会被标注 |
| `git_commit` | `message`, `workspace?`, `paths?` | 先暂存给定路径（省略则提交已暂存内容）再提交 |
| `git_branch` | `action` (`list`\|`checkout`\|`create`), `workspace?`, `branch?` | 列出 / 切换 / 新建分支 |

`workspace` 省略时使用配置中的默认工作区。

## 安全模型

- **工作区白名单**：浏览器能传的只有工作区 id，或一个「会话工作目录」；后者必须在已注册工作区路径之内，Host 才会采用它，并且 git 命令的 cwd 始终取注册路径，绝不直接使用浏览器给的绝对路径。
- **无 shell**：`execFile('git', args)`，参数逐个传递，分支名、路径、提交信息都无法被解释成命令。
- **路径校验**：所有落在 git 命令里的路径先过 `assertRelativePath`（拒绝空串、绝对路径、`..` 段、NUL）。
- **鉴权前置**：路由先跑 `connection.requestRejection(req)`，未通过时连工作区列表都不返回。
- **破坏性操作两次确认**：UI 弹框，Host 侧还要求请求体带 `confirm: true` 且路径确实处于变更状态，否则拒绝。
- **可观测的失败**：git 非零退出、超时、`index.lock` 冲突等都会以结构化 code + git 自己的报错首行返回，不吞错。

## 限制

- 不做网络操作：没有 fetch / pull / push / clone。
- 不做 stash、rebase、merge、cherry-pick、冲突解决。
- 提交历史一次最多 500 条；文件列表一次最多 400 个。
- 泳道超过 8 条会折叠并提示，不会横向撑破布局。
- 图上的泳道配色是固定 8 色调色板（数据编码需要），其余颜色全部来自宿主主题令牌。

## 开发

```bash
npm install          # 只有 esbuild 与 @base-ui-components/react 两个开发依赖
npm run build        # src/client/* → client.js（esbuild + module-loader 外壳）
npm test             # node --test test/
npm run check        # node --check 四个运行期入口
```

- Host 半边（`index.js` / `git.js` / `api.js`）是**零依赖**的纯 ESM，只用 `node:` 内置模块，不需要构建。
- 浏览器半边由 `src/client/` 构建而来，`client.js` **必须提交**：`install_bundle` 只做链接安装，不会在 profile 里构建。
- 构建脚本会断言产物里除 `react` / `react-dom` / `react/jsx-runtime` 之外没有其它外部模块——这三项来自 Web UI 的共享模块表，其余一切（含 Base UI）必须打进 bundle。

目录：

```
dsh-git/
├── index.js               # Host 入口：配置校验、路由与工具装配
├── git.js                 # git 执行、解析与唯一实现
├── api.js                 # /dsh-git/api/* 路由与鉴权
├── client.js              # 构建产物（浏览器半边）
├── scripts/build-client.mjs
├── src/shared/graph.js    # 提交树泳道布局（纯函数，两端共用）
├── src/client/            # React + Base UI 视图
└── test/                  # node --test：布局、解析、真实仓库、HTTP
```

## 许可与第三方

代码 MIT。见 [`LICENSE`](./LICENSE)。图标为 Git 官方 logo（Jason Long，CC BY 3.0，经 devicon 分发），浏览器半边打包了 Base UI（MIT）；完整归属见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
