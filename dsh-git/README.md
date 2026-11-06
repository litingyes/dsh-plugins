# @litingyes/dsh-git

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Git 插件：**在输入框下方的状态行直接查看并切换当前分支**；右侧栏的 Git 页签**跟着当前会话的工作区走**，以多分支提交树为主视图，节点显示 description / author / date / commit，点开看提交详情；旁边是变更暂存、提交，以及分支与工作树管理。两处共用同一份仓库状态。0.3.0 起不再注册智能体工具。

> 只读写本机的 Git 仓库，不做任何网络操作（没有 fetch / pull / push / clone）。

## 输入框下方的分支切换

输入框下方的状态行（和 token / 性能统计同一行）有一个分支胶囊，显示当前会话工作区所在仓库的分支，不用打开右侧栏。

- 胶囊是状态行里的一个小 pill：透明底，悬停/展开时高亮；分支名过长会省略；当前处于分离 HEAD 时显示短 SHA（悬停看完整 SHA）；有未提交改动时旁边有一个小圆点，悬停显示文件数。
- 点击胶囊**向上**打开本地分支选择器（宿主菜单材质）：输入框即时过滤，当前分支带勾选标记；已被其它工作树检出的分支保留在列表里，但按钮禁用、悬停提示工作树路径（与面板「分支」页同一规则）。
- 选择即切换，不弹二次确认：`git switch` 会拒绝会覆盖本地改动的切换，拒绝原因直接显示在选择器里，工作区不会被强制重置。
- 同一个选择器里可以「新建分支并切换」；分支名由 Host 的 `git check-ref-format --branch` 校验，非法名字会带着 git 的报错显示出来。
- 分支胶囊和右侧栏 Git 页签共用同一份仓库快照：任意一边切换分支，另一边立即跟着变。打开选择器、或切回窗口时都会重新读取一次，以跟上智能体或终端里改过的分支。
- 文案跟随 App 语言（中文 / English），面板、页签标题和选择器一起切换。
- 空白会话的首屏（hero）没有这条状态行，发出第一条消息、进入正常会话后胶囊出现。
- 会话工作目录不是 Git 仓库、没有工作目录、或目录不在已注册工作区内时，胶囊不出现；对应的解释仍在右侧栏面板里。

## 界面

在右侧栏点「+」打开起始页，选 **工作区 Git**，它作为一个右栏页签出现（每个会话各自记住自己的页签布局）。面板不让你选工作区：它显示的就是**当前会话工作区**的仓库，切换会话即切换仓库。

右栏很窄，面板按**容器宽度**而不是窗口宽度排版：分支行与文件行采用自适应两段式，行尾的按钮与徽标不会被右边缘裁掉；窄时单列、该省略的省略、该换行的换行，不会出现横向滚动条；把右栏切成全屏（右侧栏的展开按钮）后，变更页会自动回到左右两栏。

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
- 已被某个工作树检出的分支不能再次切换：行上标注「工作树」，切换按钮禁用（git 会拒绝重复检出）。
- 新建分支并切换；分支名交给 `git check-ref-format --branch` 校验。
- 三个分组按「本地分支 → 工作树 → 远程分支」排列，点分组标题即可折叠/展开（默认展开）。
- **工作树列表**：列出该仓库的全部工作树——路径（仓库内用相对路径，仓库外尽量用 `~` 缩写）、分支、短 HEAD，以及「当前 / locked / prunable」徽标。
- **新建工作树**：填分支名与路径，选「新建分支」（`git worktree add -b`）或「检出已有分支」；默认路径 `<工作区根>/.agents/worktrees/<分支名>`（工作区根通常就是仓库根；相对路径按工作区根解析），可改。
- 默认目录 `.agents/worktrees/` 若还没有 `.gitignore`，创建时会补一行 `*`（与智能体的工作树工具写入的是同一个标记文件），否则新工作树会在主仓库里显示成未跟踪文件。
- **移除工作树**：必须二次确认；勾选「强制移除」会丢弃该工作树里未提交的改动。
- **prune**：仅当列表里存在 prunable 项时出现，清理目录已消失但登记还在的失效工作树。
- 面板不移动会话目录：新建出来的工作树要你自己进去（在新目录里开会话）；面板始终读写已注册工作区的根仓库。

## 安装

插件是一个 Cordis bundle，用 DSH 的插件管理器安装，**不要手改** profile 的 `package.json` 或 `cordis.patch.yml`：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-git
```

已发布到 npm，可按包名安装：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-git@0.4.0
```

安装后左侧栏不再有 Git 图标：会话开始后，输入框下方的状态行会自动出现分支胶囊，完整面板的入口在右侧栏「+」的起始页里。浏览器半边升级后，桌面 App 需要**重启**（或设置 → Plugins 里关开插件）才能加载新的 `client.js`；`dsh web` 刷新页面即可。Host 半边（`index.js` / `git.js` / `api.js`）由 Loader 在启动时载入，**升级后需要重启 DSH** 才生效。卸载：`plugin_manager action=remove_bundle target=@litingyes/dsh-git`。

### 前提

- DSH `>= 0.2.1-rc.5 < 0.3.0-0`。分支胶囊需要 composer 的状态行（core 的 `@deepseek-ai/dsh-client-ui-conversation`），完整面板需要右侧栏（`@deepseek-ai/dsh-client-ui-sidebar-right`）：缺少哪一半就少哪个入口，不会报错。
- 本机 `PATH` 上有可用的 `git`（插件用 `execFile` 直接调用，不经过 shell）。
- 当前会话的工作目录要落在某个已注册的 DSH 工作区内。会话没有工作目录、或目录在工作区之外时，面板会给出对应的空态/错误提示。

## 配置

配置写在 `cordis.patch.yml` 的挂载行里；**覆盖这一行会整体替换 `config`**，需要重述所有字段。非法值会在挂载时直接报错，不会静默降级。

> 0.3.0 移除了四个智能体工具（`git_status` / `git_diff` / `git_commit` / `git_branch`）与 `tools`、`defaultWorkspaceId` 两个配置项。profile patch 里遗留的这两个键会被忽略，不会报错。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `refs` | `all` | `all` = 提交图追踪全部分支；`head` = 只追踪当前分支 |
| `maxCommits` | `200` | 提交图抓取的提交数，20–500 |
| `maxDiffBytes` | `400000` | 单个补丁返回给浏览器的字节上限，10KB–2MB，超出截断并提示 |
| `commandTimeoutMs` | `15000` | 单次 git 调用的超时，500–120000 |

## 安全模型

- **工作区白名单**：浏览器能传的只有工作区 id，或一个「会话工作目录」；后者必须在已注册工作区路径之内，Host 才会采用它，并且 git 命令的 cwd 始终取注册路径，绝不直接使用浏览器给的绝对路径。
- **无 shell**：`execFile('git', args)`，参数逐个传递，分支名、路径、提交信息都无法被解释成命令。
- **路径校验**：所有落在 git 命令里的路径先过 `assertRelativePath`（拒绝空串、绝对路径、`..` 段、NUL）。
- **工作树路径校验**：新建的路径必须在已注册工作区根内、不在 `.git` 内、且目标尚不存在；移除只接受该仓库 `worktree list` 里登记过的路径，永远不碰主工作树与当前工作树。
- **鉴权前置**：路由先跑 `connection.requestRejection(req)`，未通过时连工作区列表都不返回。
- **破坏性操作两次确认**：丢弃改动、移除工作树都先弹确认框，请求体必须带 `confirm: true`；丢弃还会复核路径确实处于变更状态，否则拒绝。
- **可观测的失败**：git 非零退出、超时、`index.lock` 冲突等都会以结构化 code + git 自己的报错首行返回，不吞错。

## 限制

- 不做网络操作：没有 fetch / pull / push / clone。
- 面板不移动会话目录：新建工作树只是登记一个目录，进去开会话要你自己操作。
- 不做 stash、rebase、merge、cherry-pick、冲突解决。
- 分支胶囊只列本地分支（与面板一致，不检出远程分支）。
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
├── index.js               # Host 入口：配置校验与路由装配
├── git.js                 # git 执行、解析与唯一实现
├── api.js                 # /dsh-git/api/* 路由与鉴权
├── client.js              # 构建产物（浏览器半边）
├── scripts/build-client.mjs
├── src/shared/graph.js    # 提交树泳道布局（纯函数，两端共用）
├── src/client/            # React + Base UI 视图（面板、会话页分支胶囊、共享 store）
└── test/                  # node --test：布局、解析、真实仓库、HTTP
```

## 许可与第三方

代码 MIT。见 [`LICENSE`](./LICENSE)。图标为 Git 官方 logo（Jason Long，CC BY 3.0，经 devicon 分发），浏览器半边打包了 Base UI（MIT）；完整归属见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
