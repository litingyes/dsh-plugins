# AGENTS.md

给在这个仓库里工作的 agent（以及维护者）的硬性规范。仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件 monorepo：`dsh-git/` 与 `dsh-context7/` 是两个独立的 npm 包，`site/` 是 Astro 门户。

## 一、硬规则（CI 会拦，别绕）

1. **`dsh-git/client.js` 是构建产物，必须提交。**
   改过 `dsh-git/src/client/**`（或任何会进入浏览器半边的文件）之后，跑 `cd dsh-git && npm run build` 并把 `client.js` 一起提交。
   `npm run check` 会重建比对，产物过期直接失败；产物文件头的横幅里还带着版本号，所以**发版后也必须重建**。

2. **不要手改 `<插件>/package.json` 的 `version`。**
   版本号只能由发版命令改。功能提交里顺手 bump、却没有人打 tag，就是 npm 跳号的直接原因。

3. **每个 tag 必须指向声明该版本的提交，且该提交在 `release` 的历史上。**
   `node scripts/check-release.mjs` 在每次推 `release` 时校验；不满足就红。

4. **不要推旧 tag。** 发布工作流拒绝低于 npm `latest` 的版本，避免把 `latest` 往回带。

5. **动了插件代码/根脚本后，同步站点数据。**
   `cd site && pnpm sync`，然后提交 `site/src/data/*.json`。`pnpm check` 会因数据过期失败。
   不触发这条的路径：根 `README.md`、`AGENTS.md`、`.github/`、`scripts/`、`site/`。

6. **文档是双语的。** 面向用户的改动同时更新 `README.md` 与 `README.en.md`；插件清单文案同时更新 `locale/zh.json` 与 `locale/en.json`。

## 二、产物与生成物

| 路径 | 性质 | 说明 |
| --- | --- | --- |
| `dsh-git/client.js` | 生成物，**提交** | 由 `scripts/build-client.mjs` 从 `dsh-git/src/client/` 打包；改源码不要改它 |
| `dsh-context7/client.js` | 手写 | 无构建流程，直接编辑 |
| `dsh-git/src/shared/graph.js` | 源码，两端共用 | 门户同步脚本也 import 它 |
| `site/src/data/*.json` | 生成物，**提交** | `pnpm sync` 产出；Vercel 浅克隆，构建时没有 git 历史 |
| `*/cordis.patch.yml` | 手写配置 | 用 `plugin_manager` 安装，不要手改 profile 里的同名文件 |

## 三、命令

```bash
# 插件（各自目录内）
npm install            # 仅 dsh-git 有开发依赖（esbuild、Base UI）
npm run build          # dsh-git：重建 client.js
npm test               # node --test test/
npm run check          # 产物新鲜度 + 语法；dsh-git 先跑 build --check

# 仓库根
node scripts/check-release.mjs            # 门禁：每个 manifest 版本都有 tag
node --test scripts/*.test.mjs            # 门禁自身的测试（Node 22 不展开目录参数）
node scripts/release.mjs <dir> --bump patch --dry-run   # 演练发版
node scripts/release.mjs <dir> --bump patch --push      # 发版

# 门户
cd site && pnpm install && pnpm build && pnpm check      # 构建 + 数据/链接/对比度三门禁
```

## 四、版本与发布

**语义化版本（0.x）**：破坏性变更与功能升 `minor`，修复/文档升 `patch`。历史一致：0.2.0 删掉四个智能体工具（破坏性）→ 0.3.0。

**发版只走一条命令**（它负责 bump、重建产物、改写安装 pin、提交、打 annotated tag、推送，一步完成）：

```bash
node scripts/release.mjs dsh-git --bump patch --push
node scripts/release.mjs dsh-context7 --bump patch --push
```

- `--dry-run` 先看计划；`--bump` 省略时只给已 bump 的 manifest 打 tag（重打 tag 用）。
- 发版提交固定为 `release: <dir> <version>`。
- 推上去之后：`.github/workflows/ci.yml` 跑门禁、`.github/workflows/publish.yml` 发布（版本已在 npm 上则跳过）。
- 收尾：`cd site && pnpm sync` 并提交数据（版本号与提交图都来自这里）。

## 五、提交风格

Conventional Commits + scope：`feat(git): …`、`fix(git): …`、`docs(git): …`、`chore(site): …`、`build(git): …`。发版提交例外，固定 `release: <dir> <version>`。一个提交做一件事；功能提交不要夹带版本号。

## 六、依赖纪律

- Host 半边（`index.js` / `git.js` / `api.js`）**零依赖**，只用 `node:` 内置模块，不需要构建。
- 浏览器半边除 `react` / `react-dom` / `react/jsx-runtime` 外**不得 external**，其余（含 Base UI）必须打进 bundle；构建脚本会断言这一点。
- 引入第三方代码要更新 `THIRD_PARTY_NOTICES.md`；代码许可保持 MIT。

## 七、设计约束（别“顺手”改）

- `dsh-git` **不注册任何智能体工具**（0.3.0 起有意为之）：智能体本来就会 git，面板才是这个包提供的界面。要加工具属于产品决策，不是顺手补齐。
- `dsh-git` 不做网络操作：没有 fetch / pull / push / clone。
- 提交、合并、变基一律 `--no-verify`（钩子不跑），这是有意的并已写进 README 限制。

## 八、不要做

- 手改 profile 的 `package.json` 或 `cordis.patch.yml`（装插件一律用 `plugin_manager`）。
- `git push --force` 覆盖已发布的 tag。
- 本地手动 `npm publish`（发布只由 tag 触发，需要 provenance）。
- 在 `site/src/data/plugins.ts` 里写死版本号 / 安装命令 / DSH 范围——它们从 `plugins-meta.json` 派生。

## 九、更多细节

- 安装、配置、限制：根 [`README.md`](./README.md) 与各插件目录下的 `README.md` / `README.en.md`。
- 门户构建与部署：`site/README.md`。
- 发布流程图与 tag 命名：根 `README.md` 的「发布」章节。
