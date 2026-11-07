# @litingyes/dsh-director

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **AI 视频导演**插件：把"我想做一条……"变成能真正拿去生成的分镜、**可粘贴提示词**和音画方案。

插件**不生成视频、不调用任何生成接口、不上传素材**。它产出的是用户复制到可灵 / 即梦 / 海螺等平台的三样东西——**正向提示词、负向提示词、参数**——以及让这些提示词成立的剧情结构、分镜表和音画设计。

它解决的不是"怎么写一句提示词"，而是"剧情怎么组织、分镜怎么分、声音和画面怎么配"：这些方法固化在内置技能 `ai-video-direction` 里，项目的每个决定落在工作区的 `video/` 文件里，换一个会话也能接着做。

## 它由四部分组成

1. **六个智能体工具**：项目、分镜、take、音频、提示词、检查。
2. **内置技能 `ai-video-direction`**：故事骨架、分镜写法、景别/运镜词表、提示词配方、平台适配、音画设计、常见失败与修正。
3. **一段常驻引导**：让"我想做个 AI 视频"的请求走到工具和技能上，而不是得到一段散装提示词。
4. **右栏「导演」页签**：看故事板、复制提示词、下载提示词清单、看检查结果。面板**只读**，所有改动由对话里的工具完成，避免两条写路径互相覆盖。

## 提供的工具

| 工具 | 说明 | 主要参数 |
| --- | --- | --- |
| `video_project` | 读取/创建/修改项目（简报、平台、比例、目标时长、产品、角色表、风格） | `action`（init/read/update）、`title`、`logline`、`aspect`、`target_duration_sec`、`products`、`characters`、`style` |
| `video_storyboard` | 场与镜头的增删改、排序、查看 | `action`、`scene`、`shot`、`patch`、`scene_id`、`shot_id`、`position`、`force` |
| `video_take` | 记录平台生成的结果、评分、备注、选中 | `action`（list/add/select/update/remove）、`shot_id`、`take`、`take_id` |
| `video_audio` | VO / BGM / 音效的音画方案 | `action`、`track`、`patch`、`track_id` |
| `video_prompt` | 组装可粘贴的提示词（单镜/单场/全片），正向、负向、参数分开 | `scope`、`shot_id`、`scene_id`、`language` |
| `video_review` | 确定性检查：缺提示词、时长漂移、take 未选、台词无配音、负向混进正向、引用文件不存在等 | `scene_id`、`include_info` |

错误会带稳定 code（`VIDEO_PROJECT_MISSING`、`VIDEO_PATH_ESCAPE`、`VIDEO_STALE` 等），消息是给智能体的可执行指令；内容缺口不报错，交给 `video_review`。

## 一次完整流程

1. 你说："我想做一条 40 秒的悬疑故事短片，用可灵。"
2. 智能体加载 `ai-video-direction`，先问三个决定结构的问题（给谁看、发在哪、一句话故事），再补风格与产品。
3. `video_project` 的 `init` 建出 `video/`；`video_storyboard` 落场、落镜；每镜写动作、景别、运镜、时长。
4. `video_storyboard update_shot` 写入提示词：`prompt.text`（正向）、`prompt.negative`（负向）、`prompt.params`（时长/比例/首尾帧/参考图）。
5. 右栏「导演 → 提示词」逐块复制，或 `video_prompt scope=all` 在对话里拿整份清单；粘到可灵生成。
6. 生成的文件放进 `video/assets/takes/<镜头 id>/`，告诉智能体"t2 更好"；`video_take add` 记录、`select` 选中。
7. `video_audio` 补 VO、BGM、音效，标清时间与镜头。
8. `video_review` 检查到 0 error；打开「提示词」页签下载 `.md` 交给剪辑。
9. 新开会话说"接着做那条夜班短片"，智能体 `video_project read` 后继续。

## 文件格式

默认根目录 `video/`（可用 `root` 配置改）：

```
video/
├── project.json      # 简报、角色表、视觉风格、产品
├── storyboard.json   # 场景 → 镜头 → take
├── audio.json        # VO / BGM / 音效
└── assets/
    ├── ref/          # 参考图、角色图
    ├── takes/        # 平台生成的视频，按镜头分目录
    └── audio/        # 配音、音乐、音效
```

`project.json`（节选）：

```json
{
  "schemaVersion": 1,
  "title": "夜班",
  "logline": "夜班保安发现监控里多了一个自己。",
  "aspect": "9:16",
  "targetDurationSec": 40,
  "products": ["可灵"],
  "characters": [{ "id": "guard", "name": "老周", "look": "40 岁，寸头，深蓝制服" }]
}
```

`storyboard.json` 的一个镜头（节选）：

```json
{
  "id": "S1-01",
  "durationSec": 4,
  "shotSize": "中景",
  "movement": "缓推",
  "action": "盯着屏幕，身体前倾",
  "prompt": {
    "text": "凌晨监控室，40 岁保安坐在操作台前，屏幕冷光照亮侧脸，缓慢推近，冷蓝色调，写实电影质感",
    "negative": "文字水印, 变形的手, 多余人物",
    "product": "可灵",
    "params": { "duration": "5s", "aspect": "9:16", "references": ["assets/ref/guard.png"] }
  },
  "status": "prompt_ready",
  "takes": []
}
```

约定：

- id：场 `S1`、镜 `S1-01`、take 每镜内 `t1`、音轨 `A1`，创建时自动生成，此后不变。
- 状态机：`planned → prompt_ready → generating → generated → selected`，另有 `dropped`。`video_take add` 会把计划/提示词就绪的镜头推进到 `generated`，`select` 推进到 `selected`。
- 路径：take 与素材引用必须是项目内相对路径（`assets/...`），工具会拒绝绝对路径与 `..`。
- 手改 JSON 允许，但 `schemaVersion` 必须是 `1`；工具与面板都会校验并在无法解析时指出文件。

## 右栏「导演」页签

在右侧栏点「+」，选 **AI 视频导演**，它作为页签跟随当前会话的工作区。

- **故事板**：按场折叠，镜头卡显示 id、时长、状态、景别/运镜、动作、take 与选中标记，以及提示词就绪状态；卡片上的复制按钮直接复制正向提示词。
- **提示词**：核心页签。每个镜头把正向 / 负向 / 参数分成三块，各自带复制按钮；可按场复制、复制全片、下载 `.md`。复制内容与 `video_prompt` 工具逐字一致。
- **音画**：按配音 / 音乐 / 音效分组，显示时间、关联场景或镜头、文本或文件。
- **检查**：与 `video_review` 同一份结果，按错误/警告/提示分组，展开看具体位置与修正建议。

面板**只读**：改动一律通过对话里的工具完成（工具带版本守卫，避免覆盖你在编辑器里的修改）。点右上角刷新或切回窗口即可拿到最新状态。

## 安装

从 npm 安装：

```text
plugin_manager action=install_bundle target=@litingyes/dsh-director@0.1.0
```

本地开发时按目录安装：

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-director
```

也可在 Web 侧边栏的 **Plugins** 页面用本地路径、压缩包或 Git 地址安装。安装后：

- Host 半边（工具、技能、检查、API）由 Loader 在启动时载入，**需要重启 DSH**。
- 浏览器半边（右栏页签）随页面刷新加载；桌面端升级后需要重启或关开插件。

## 配置

`cordis.patch.yml` 里这一行的 `config`，字段都会在挂载时校验，非法值直接让这一行挂载失败：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `root` | `video` | 项目目录，相对会话工作目录；不允许绝对路径与 `..` |
| `guidance` | `true` | 是否注册常驻引导段落 |
| `skill` | `true` | 是否注册内置技能 |
| `defaultAspect` | `9:16` | 新项目默认比例（`16:9` / `9:16` / `1:1` / `4:5` / `4:3` / `3:4` / `21:9`） |
| `maxScenes` | `40` | 场数上限 |
| `maxShotsPerScene` | `60` | 单场镜头数上限 |
| `maxTakesPerShot` | `20` | 单镜 take 数上限 |
| `maxPromptChars` | `2000` | 单条提示词字符上限 |
| `minShotSeconds` | `1` | 单镜最短时长 |
| `maxShotSeconds` | `10` | 单镜最长时长（必须大于最短） |
| `durationTolerance` | `0.15` | 计划总时长与目标时长允许的偏差（0–1） |

覆盖这一行时 `config` 是整体替换，记得把还想保留的字段一起写上。

## 限制

- **不生成视频**，不调用可灵/即梦/海螺的任何接口，不上传、不下载素材。
- 面板只读；写操作只走工具，工具用读到的版本做乐观并发控制，冲突会返回 `VIDEO_STALE` 让你重读。
- 不做 ffprobe、转码、播放、缩略图；take 文件是否存在只在 review 里做 `stat` 检查。
- 技能正文为中文；界面中英双语；工具描述与结果文案为英文（与 DSH 内置工具一致）。
- 常驻引导只提高触发概率，不保证每次都会加载技能。
- 平台能力（时长上限、首尾帧、参考图、运镜）以用户界面为准，插件不硬编码；不确定时智能体会问。

## 开发

```bash
cd dsh-director
npm install        # 仅 esbuild
npm run build      # 重建 client.js（必须提交）
npm test           # node --test
npm run check      # 产物新鲜度 + 语法
```

浏览器半边只允许 external `react` / `react-dom` / `react/jsx-runtime`，其余必须打进 bundle；构建脚本会断言这一点。

## 卸载

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-director
```

`video/` 项目文件不会随插件删除，可自行保留或删除。

## 许可

[MIT](./LICENSE)
