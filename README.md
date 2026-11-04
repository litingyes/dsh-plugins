# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件集合。

## 插件

| 目录 | 包名 | 说明 |
| --- | --- | --- |
| [`dsh-context7`](./dsh-context7) | `@litingyes/dsh-context7` | 通过官方 MCP 服务接入 [Context7](https://context7.com)，为智能体提供库解析与最新文档查询 |

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
└── dsh-context7/
    ├── package.json        # bundle manifest（dsh.bundle.patch）
    ├── cordis.patch.yml    # 插入 MCP 客户端配置
    ├── icon.svg            # 插件图标
    ├── locale/             # 插件管理器显示用标题与描述（en / zh）
    ├── README.md           # 中文说明
    └── README.en.md        # English
```

## 许可

[MIT](./LICENSE)
