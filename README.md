# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件集合。

## 插件

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| [`dsh-context7`](./dsh-context7) | `@litingyes/dsh-context7` | 通过官方 MCP 服务接入 [Context7](https://context7.com)，为智能体提供库解析与最新文档查询 |
| [`dsh-git`](./dsh-git) | `@litingyes/dsh-git` | 输入框下方状态行直接显示并切换 Git 分支；右侧栏 Git 页签跟着会话工作区走：多分支提交树（节点可展开看详情，右键 cherry-pick / revert / drop）、变更暂存与提交、分支右键 merge / rebase、分支与工作树管理 |
| [`dsh-director`](./dsh-director) | `@litingyes/dsh-director` | 把想法变成分镜、可粘贴提示词与音画方案：六个工具维护工作区的 `video/` 项目，内置导演技能讲清剧情、分镜、音画与可灵/即梦/海螺提示词，右栏「导演」页签看故事板、复制提示词、下载清单并查看检查结果。不生成视频，只产出拿去平台粘贴的输入 |

## 门户网站

[`site/`](./site) 是 Astro + Tailwind 构建的对外门户：介绍各插件的功能、智能体工具与配置边界，并提供安装命令。中文在 `/`，英文在 `/en/`。提交图用的是本仓库真实的 git 历史，由插件自己的 `layoutGraph` 排版。

```sh
cd site
pnpm install
pnpm sync     # 有新提交后重新生成 site/src/data/*.json 并提交
pnpm dev      # http://localhost:4321
```

部署在 Vercel，项目 Root Directory 指到 `site` 即可，仓库里不放部署配置；细节见 [`site/README.md`](./site/README.md)。

## 安装

每个插件都是一个独立的 Cordis bundle，用 DSH 的插件管理器安装，**不要手改** profile 的 `package.json` 或 `cordis.patch.yml`。

从 npm 安装（推荐）：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.2.1
plugin_manager action=install_bundle target=@litingyes/dsh-git@0.5.1
plugin_manager action=install_bundle target=@litingyes/dsh-director@0.1.0
```

本地开发时按目录安装：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-git
```

不发 npm 也可以直接从 GitHub 装；这是 monorepo，必须用 `path:` 指到子目录：

```text
plugin_manager action=install_bundle target=git+https://github.com/litingyes/dsh-plugins.git#release&path:/dsh-git
```

Web 侧边栏的 **Plugins** 页面同样接受包名、Git 地址、压缩包和本地绝对路径。各插件的安装前提、配置项与限制见对应目录下的 README。

## 发布

发布由 tag 触发 GitHub Actions（[`publish.yml`](./.github/workflows/publish.yml)），tag 名形如 `dsh-git-v0.5.1`、`dsh-context7-v0.2.1`、`dsh-director-v0.1.0`。

新增插件的首次发布：manifest 里写初始版本（如 `0.1.0`），合并到 `release` 后运行 `node scripts/release.mjs <目录> --push`（不带 `--bump`，用清单里的版本打 tag）。否则 `check-release.mjs` 会因为该版本没有 tag 让 `release` 的 CI 变红。

**规则：版本号只在发版提交里改。** 功能提交不要顺手 bump `package.json`——发布只认 tag，改了版本却没打 tag，那个版本永远不会进 npm，registry 就会跳号（本仓库曾经从 0.2.0 直接跳到 0.5.0，0.3.0 / 0.4.0 只活在 manifest 里）。[`ci.yml`](./.github/workflows/ci.yml) 在每次推 `release` 时跑 `scripts/check-release.mjs`，manifest 版本没有匹配 tag 就变红。

一条命令完成一次发版（bump、重建产物、改写安装 pin、提交、打 annotated tag、推送）：

```bash
node scripts/release.mjs dsh-git --bump patch --push
```

- 0.x 语义：破坏性变更与功能升 `minor`，修复 / 文档升 `patch`。
- 先演练：加 `--dry-run` 只打印计划；省略 `--bump` 则只给已经 bump 好的 manifest 打 tag（重打 tag 时用）。
- 工作流校验 tag 与 `package.json` 版本一致、拒绝比 npm `latest` 更旧的版本，然后 `npm publish --access public --provenance`；该版本已在 npm 上时跳过，所以先手动 `npm publish` 再推 tag 也不会失败。
- 发版后记得 `cd site && pnpm sync` 并提交 `site/src/data/*.json`，门户的版本号与提交图都来自那里。

仓库需要配置 `NPM_TOKEN` secret（npm automation token，或改用 npm trusted publishing）。`prepublishOnly` 会在打包前重建并检查（`dsh-git` 是 `npm run build && npm run check`），避免把旧的 `client.js` 发出去。完整的仓库规范见 [`AGENTS.md`](./AGENTS.md)。

## 目录结构

```
dsh-plugins/
├── README.md
├── AGENTS.md               # 仓库规范：发版、产物、双语、站点数据
├── .github/workflows/      # push 到 release 跑版本门禁；推 tag 触发 npm 发布
├── scripts/
│   ├── release.mjs         # 发版：bump / 重建 / 改 pin / 提交 / 打 tag / 推送
│   ├── check-release.mjs   # 门禁：每个 manifest 版本都必须有匹配 tag
│   └── packages.mjs        # 两个脚本共用的包清单与 tag 命名
├── site/                   # Astro 门户（独立 pnpm 包，Vercel 的 Root Directory）
├── dsh-context7/           # 纯手写 JS，无需构建
│   ├── package.json        # bundle manifest（dsh.bundle.patch + dsh.client）
│   ├── cordis.patch.yml    # 插入 MCP 客户端配置与引导行配置
│   ├── index.js            # Host 入口：浏览器半边载体 + 常驻触发引导
│   ├── client.js           # 浏览器半边（手写，无构建）
│   ├── scripts/            # usage-report.mjs：统计本机会话的工具使用占比
│   ├── test/               # node --test
│   ├── icon.svg            # 插件图标
│   ├── locale/             # 插件管理器显示用标题与描述（en / zh）
│   ├── README.md           # 中文说明
│   └── README.en.md        # English
├── dsh-git/                # 带浏览器构建产物
│   ├── package.json        # bundle manifest（dsh.bundle.patch + dsh.client）
│   ├── cordis.patch.yml    # 挂载 Host 行与配置
│   ├── index.js            # Host 入口（零依赖纯 ESM）
│   ├── git.js / api.js     # git 实现与 HTTP 路由
│   ├── client.js           # 浏览器半边构建产物（必须提交）
│   ├── src/, scripts/      # React + Base UI 源码与 esbuild 脚本
│   ├── test/               # node --test
│   ├── icon.svg
│   ├── locale/
│   ├── README.md
│   └── README.en.md
└── dsh-director/           # Host + 浏览器半边（client.js 需构建提交）
    ├── package.json        # bundle manifest（dsh.bundle.patch + dsh.client）
    ├── cordis.patch.yml    # 挂载 Host 行与默认配置
    ├── index.js            # Host 入口：工具、技能、引导、HTTP 路由
    ├── production.js       # 纯领域层：校验、id、增删改、检查
    ├── store.js / api.js   # ctx.fs 读写（版本守卫）与只读面板路由
    ├── tools.js            # 6 个工具定义
    ├── skill.js / skill.md # 内置 ai-video-direction 技能
    ├── src/shared/         # 提示词拼装（Host 与客户端共用）
    ├── src/client/         # React 面板源码
    ├── scripts/            # esbuild 构建脚本
    ├── client.js           # 浏览器半边构建产物（必须提交）
    ├── test/               # node --test
    ├── icon.svg
    ├── locale/
    ├── README.md
    └── README.en.md
```

`dsh-git` 与 `dsh-director` 的浏览器半边需要构建：改动 `src/client/` 后在该目录运行 `npm install && npm run build`，并把生成的 `client.js` 一起提交（插件以目录链接方式安装，profile 内不会执行构建）。

## 许可

[MIT](./LICENSE)
