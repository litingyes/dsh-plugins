# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件集合。

## 插件

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| [`dsh-context7`](./dsh-context7) | `@litingyes/dsh-context7` | 通过官方 MCP 服务接入 [Context7](https://context7.com)，为智能体提供库解析与最新文档查询 |
| [`dsh-git`](./dsh-git) | `@litingyes/dsh-git` | 右侧栏 Git 页签，跟着会话工作区走：多分支提交树（节点可展开看详情）、变更暂存与提交、分支切换，并把同样的操作提供为智能体工具 |

## 安装

每个插件都是一个独立的 Cordis bundle，用 DSH 的插件管理器安装，**不要手改** profile 的 `package.json` 或 `cordis.patch.yml`。

从 npm 安装（推荐）：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.1.0
plugin_manager action=install_bundle target=@litingyes/dsh-git@0.2.0
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

发布由 tag 触发 GitHub Actions（[`.github/workflows/publish.yml`](./.github/workflows/publish.yml)），tag 名形如 `dsh-git-v0.2.1`、`dsh-context7-v0.1.1`：

1. 改版本并提交（`npm version` 只改 manifest，不打 tag）：

   ```bash
   (cd dsh-git && npm version patch --no-git-tag-version)
   git add -A && git commit -m "release: dsh-git 0.2.1"
   ```

2. 打 tag 并推送，CI 随即发布：

   ```bash
   node scripts/release.mjs dsh-git --push
   ```

3. 工作流校验 tag 与 `package.json` 版本一致后执行 `npm publish --access public --provenance`。该版本已在 npm 上时跳过，所以先手动 `npm publish` 再推 tag 也不会失败。

仓库需要配置 `NPM_TOKEN` secret（npm automation token，或改用 npm trusted publishing）。本地手动发布时，`prepublishOnly` 会先跑构建与检查（`dsh-git` 是 `npm run build && npm run check`），避免把旧的 `client.js` 发出去。

## 目录结构

```
dsh-plugins/
├── README.md
├── .github/workflows/      # 推 tag 触发 npm 发布
├── scripts/release.mjs     # 打 tag / 推送
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
└── dsh-git/                # 带浏览器构建产物
    ├── package.json        # bundle manifest（dsh.bundle.patch + dsh.client）
    ├── cordis.patch.yml    # 挂载 Host 行与配置
    ├── index.js            # Host 入口（零依赖纯 ESM）
    ├── git.js / api.js     # git 实现与 HTTP 路由
    ├── client.js           # 浏览器半边构建产物（必须提交）
    ├── src/, scripts/      # React + Base UI 源码与 esbuild 脚本
    ├── test/               # node --test
    ├── icon.svg
    ├── locale/
    ├── README.md
    └── README.en.md
```

`dsh-git` 的浏览器半边需要构建：改动 `src/client/` 后在该目录运行 `npm install && npm run build`，并把生成的 `client.js` 一起提交（插件以目录链接方式安装，profile 内不会执行构建）。

## 许可

[MIT](./LICENSE)
