# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件集合。

## 插件

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| [`dsh-context7`](./dsh-context7) | `@litingyes/dsh-context7` | 通过官方 MCP 服务接入 [Context7](https://context7.com)，为智能体提供库解析与最新文档查询 |
| [`dsh-git`](./dsh-git) | `@litingyes/dsh-git` | 输入框下方状态行直接显示并切换 Git 分支；右侧栏 Git 页签跟着会话工作区走：多分支提交树（节点可展开看详情）、变更暂存与提交、分支与工作树管理 |

## 安装

每个插件都是一个独立的 Cordis bundle，用 DSH 的插件管理器安装，**不要手改** profile 的 `package.json` 或 `cordis.patch.yml`。以本地目录安装为例：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-context7
```

也可以在 Web 侧边栏的 **Plugins** 页面选择本地包目录。发布到 npm 后可以按包名安装，例如：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-context7@0.1.0
```

各插件的安装前提、配置项与限制见对应目录下的 README。

## 目录结构

```
dsh-plugins/
├── README.md
├── dsh-context7/           # 纯手写 JS，无需构建
│   ├── package.json        # bundle manifest（dsh.bundle.patch）
│   ├── cordis.patch.yml    # 插入 MCP 客户端配置
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
