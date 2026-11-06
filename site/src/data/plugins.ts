import pluginsMetaJson from './plugins-meta.json'
import type { L, PluginDoc, PluginsMeta, ToolDoc } from '../lib/types'

/**
 * Name, version and DSH range as read from each plugin's manifest by
 * `pnpm sync`. Pages derive install commands and requirements from here, so a
 * version bump can never leave copy behind.
 */
const meta = pluginsMetaJson as PluginsMeta

/** One plugin's manifest facts, or a loud failure instead of an `undefined`. */
export function manifest(slug: string): PluginsMeta[string] {
  const entry = meta[slug]
  if (entry === undefined) throw new Error(`plugins-meta.json has no entry for ${slug}; run \`pnpm sync\``)
  return entry
}

/** The install command a reader copies, pinned to the manifest version. */
function installCommand(slug: string): string {
  const entry = manifest(slug)
  return `plugin_manager action=install_bundle target=${entry.name}@${entry.version}`
}

/** The DSH range from the manifest, kept in one place for both locales. */
function dshRange(slug: string): string {
  return manifest(slug).dsh
}

/** One sentence for both plugins' DSH ranges, correct even if they diverge. */
function bothDshRanges(): L {
  const git = dshRange('dsh-git')
  const context7 = dshRange('dsh-context7')
  if (git === context7) {
    return { zh: `两个插件都要求 DSH ${git}。`, en: `Both require DSH ${git}.` }
  }
  return {
    zh: `dsh-git 要求 DSH ${git}；dsh-context7 要求 DSH ${context7}。`,
    en: `dsh-git requires DSH ${git}; dsh-context7 requires DSH ${context7}.`,
  }
}

/** Everything a page shows that is not plugin-specific. */
export const siteCopy = {
  brand: 'dsh-plugins',
  title: {
    zh: 'dsh-plugins：DeepSeek Harness 插件集',
    en: 'dsh-plugins: plugins for DeepSeek Harness',
  } as L,
  description: {
    zh: '两个 DeepSeek Harness 插件：输入框下方的分支胶囊与右栏的多分支 Git 面板，和把 Context7 文档接进对话的两个工具。安装、配置与边界。',
    en: 'Two DeepSeek Harness plugins: a branch chip below the composer with a multi-branch Git panel in the right sidebar, and the Context7 docs tools inside the conversation. Install, configuration and limits.',
  } as L,
  nav: {
    git: { zh: '工作区 Git', en: 'Workspace Git' } as L,
    context7: { zh: 'Context7', en: 'Context7' } as L,
    install: { zh: '安装', en: 'Install' } as L,
    skip: { zh: '跳到主要内容', en: 'Skip to content' } as L,
    langLabel: { zh: '切换到英文', en: 'Switch to Chinese' } as L,
    langShort: { zh: 'EN', en: '中文' } as L,
  },
  footer: {
    built: {
      zh: 'Astro 与 Tailwind CSS。',
      en: 'Astro and Tailwind CSS.',
    } as L,
    license: { zh: '代码 MIT', en: 'Code MIT' } as L,
    credits: {
      zh: '图标：Git 标志（Jason Long，CC BY 3.0）、Context7 文件图标（vscode-icons，MIT）。字体：Host Grotesk 与 Atkinson Hyperlegible Mono，SIL Open Font License。',
      en: 'Icons: the Git logo (Jason Long, CC BY 3.0) and the Context7 file icon (vscode-icons, MIT). Fonts: Host Grotesk and Atkinson Hyperlegible Mono, SIL Open Font License.',
    } as L,
    repo: { zh: '仓库', en: 'Repository' } as L,
    readme: { zh: 'README', en: 'README' } as L,
  },
  home: {
    meta: {
      title: {
        zh: '两个插件：Git 面板与 Context7 文档',
        en: 'Two plugins: a Git panel and Context7 docs',
      } as L,
      description: {
        zh: '给 DeepSeek Harness 的两个插件：输入框下方的分支胶囊与右栏的多分支 Git 面板，和让智能体先查 Context7 文档再回答的两个工具。',
        en: 'Two plugins for DeepSeek Harness: a branch chip below the composer with a multi-branch Git panel in the right sidebar, and two tools that make the agent read current Context7 docs before answering.',
      } as L,
    },
    hero: {
      headline: { zh: '给智能体的工具，\n人也能用', en: 'One toolbelt,\ntwo pairs of hands' } as L,
      lead: {
        zh: '两个插件：Git 分支就在输入框下方、完整面板在右栏，最新文档接进对话。',
        en: 'Two plugins: the branch below the composer with the full panel in the sidebar, and current docs in the conversation.',
      } as L,
      primary: { zh: '查看插件', en: 'See the plugins' } as L,
      secondary: { zh: 'GitHub 仓库', en: 'GitHub repository' } as L,
      panelLabel: { zh: '界面预览', en: 'Interface preview' } as L,
      panelNote: {
        zh: '数据来自本仓库的 git 历史，用插件自己的泳道算法排版。',
        en: 'Data from this repository’s git history, laid out by the plugin’s own lane algorithm.',
      } as L,
      toolsLabel: { zh: '智能体这一侧', en: 'The agent side' } as L,
      toolsNote: {
        zh: 'Git 面板只做人能点的界面；对话里的工具来自 Context7。',
        en: 'The Git panel adds no agent tools; the tools in the conversation come from Context7.',
      } as L,
    },
    index: {
      repoRow: {
        name: { zh: '插件仓库', en: 'The repository' } as L,
        package: 'github.com/litingyes/dsh-plugins' as string,
        summary: {
          zh: '两个插件的源码、双语 README 与 tag 触发的发布脚本。',
          en: 'Source, bilingual READMEs, release script.',
        } as L,
        link: { zh: '仓库', en: 'GitHub' } as L,
      },
      title: { zh: '两个插件', en: 'Two plugins' } as L,
      lead: {
        zh: '都在 npm 上，都用 DSH 插件管理器安装。',
        en: 'Both are on npm, installed through the plugin manager.',
      } as L,
      open: { zh: '查看详情', en: 'Details' } as L,
    },
    graph: {
      title: { zh: '提交图', en: 'The commit graph' } as L,
      lead: {
        zh: '所有本地与远程分支按日期展开，泳道并排；点开一行看完整提交。',
        en: 'Every branch, date ordered, drawn as parallel lanes. Open a row for the commit.',
      } as L,
      caption: {
        zh: '本仓库最近的 {n} 个提交。泳道、分支徽标与文件计数都是真的。',
        en: 'This repository’s {n} newest commits; lanes and file counts are real.',
      } as L,
      link: { zh: '工作区 Git 详情', en: 'Workspace Git details' } as L,
    },
    context7: {
      title: { zh: '对话里的一行', en: 'One row in the conversation' } as L,
      lead: {
        zh: '装上工具，不等于模型会用。',
        en: 'Installing a tool is not using it.',
      } as L,
      body: {
        zh: '57 个会话、5,527 次 tool/call，两个工具只占 0.33%；装后 22.6 小时里，26 个会话只有 2 个主动用过。',
        en: '57 sessions, 5,527 tool calls: 0.33% reached the tools; after install, 2 of 26 sessions used them unprompted.',
      } as L,
      caption: {
        zh: '工具行，以及它背后那段常驻提示。',
        en: 'The row, and the paragraph behind it.',
      } as L,
      link: { zh: 'Context7 详情', en: 'Context7 details' } as L,
    },
    tools: {
      title: { zh: '两个文档工具', en: 'Two documentation tools' } as L,
      lead: {
        zh: 'Git 面板不注册智能体工具；Context7 带来这一对。',
        en: 'The Git panel registers no agent tools; Context7 brings this pair.',
      } as L,
      cols: {
        name: { zh: '工具', en: 'Tool' } as L,
        args: { zh: '参数', en: 'Arguments' } as L,
        what: { zh: '做什么', en: 'What it does' } as L,
        from: { zh: '来自', en: 'From' } as L,
      },
    },
    install: {
      title: { zh: '安装', en: 'Install' } as L,
      lead: {
        zh: '用 DSH 插件管理器装，不要手改 profile 的 package.json 或 cordis.patch.yml。',
        en: 'Install with the plugin manager.',
      } as L,
      copy: { zh: '复制', en: 'Copy' } as L,
      copied: { zh: '已复制', en: 'Copied' } as L,
      notes: [
        {
          zh: '升级 dsh-git 或改动引导段落后，重启 DSH 或重新加载插件行。',
          en: 'Restart DSH after upgrades.',
        } as L,
        bothDshRanges(),
      ],
    },
    boundaries: {
      title: { zh: '边界', en: 'Boundaries' } as L,
      lead: {
        zh: '这些事插件不做。',
        en: 'What the plugins do not do.',
      } as L,
      items: [
        {
          title: { zh: '不做网络操作', en: 'No network git' } as L,
          body: {
            zh: 'dsh-git 只读写本机仓库：没有 fetch、pull、push、clone，也没有 stash。merge / rebase / cherry-pick 只从面板的右键菜单发起，遇到冲突自动中止。',
            en: 'Local repositories only: no fetch, pull, push or clone, and no stash. Merge, rebase and cherry-pick start only from the panel’s context menus, and abort on conflict.',
          } as L,
        },
        {
          title: { zh: '浏览器给不了任意路径', en: 'The browser cannot name an arbitrary path' } as L,
          body: {
            zh: '写操作只接受工作区 id；读快照时还可以给会话目录，但必须落在已注册工作区内。git 通过 execFile 逐个传参，不经过 shell；丢弃要 UI 与 Host 两次确认。',
            en: 'Mutations take only a workspace id; a snapshot read may also name the Session directory, which must sit inside a registered workspace. execFile, no shell; discards are confirmed twice.',
          } as L,
        },
        {
          title: { zh: '查询会离开本机', en: 'Queries leave the machine' } as L,
          body: {
            zh: 'Context7 的查询内容发往远端服务；不配 API key 时按 IP 匿名限流。',
            en: 'Queries leave the machine; without a key, IP limits apply.',
          } as L,
        },
      ],
    },
  },
}

/**
 * dsh-git registers no agent tools since 0.3.0: an agent already knows git, so
 * the panel is the only surface. `PluginDoc.tools` stays empty on purpose.
 */
const gitTools: ToolDoc[] = []

const context7Tools: ToolDoc[] = [
  {
    name: 'mcp__context7__resolve-library-id',
    args: 'libraryName query',
    desc: { zh: '把库名解析成 Context7 library ID，例如 /vercel/next.js', en: 'Resolves a library name to a Context7 library ID, for example /vercel/next.js' },
  },
  {
    name: 'mcp__context7__query-docs',
    args: 'libraryId query language?',
    desc: { zh: '按 library ID 取与问题相关的最新文档与代码示例', en: 'Fetches current documentation and code examples for that library ID' },
  },
]

export const plugins: PluginDoc[] = [
  {
    slug: 'dsh-git',
    packageName: '@litingyes/dsh-git',
    runtime: {
      zh: 'Host 半边是零依赖 ESM；浏览器半边是提交进仓库的 client.js。',
      en: 'A zero-dependency ESM Host half; the browser half is a committed client.js.',
    },
    icon: '/icons/dsh-git.svg',
    name: { zh: '工作区 Git', en: 'Workspace Git' },
    tagline: {
      zh: '输入框下方的分支胶囊，和跟着当前会话工作区走的右栏 Git 面板。',
      en: 'A branch chip below the composer, and a Git panel in the right sidebar that follows the Session’s workspace.',
    },
    summary: {
      zh: '状态行里切换分支；右栏是提交图、变更、分支与工作树，提交节点右键可拣选 / 撤销 / 删除。',
      en: 'Switch branches from the status row; the sidebar holds the graph, changes, branches and worktrees, with right-click cherry-pick, revert and drop.',
    },
    install: installCommand('dsh-git'),
    installNote: {
      zh: '升级 Host 半边后需要重启 DSH 才生效。',
      en: 'The Host half is loaded at startup, so restart DSH after an upgrade.',
    },
    requirements: [
      { zh: `DSH ${dshRange('dsh-git')}，且组合里有右侧栏`, en: `DSH ${dshRange('dsh-git')} with the right sidebar in the composition` },
      { zh: 'PATH 上有可用的 git', en: 'A working git on PATH' },
      { zh: '会话工作目录落在某个已注册工作区内', en: 'The Session’s working directory inside a registered workspace' },
    ],
    signal: 'accent',
    readme: 'https://github.com/litingyes/dsh-plugins/blob/release/dsh-git/README.md',
    features: [
      {
        title: { zh: '输入框下方的分支胶囊', en: 'The branch chip below the composer' },
        body: {
          zh: '状态行里的胶囊显示当前分支与未提交改动；点开是向上弹出的本地分支选择器，输入即过滤，切换与「新建并切换」都在里面，git 的拒绝原因直接显示。',
          en: 'A status-row pill shows the current branch and the uncommitted-change dot. Clicking it opens the local-branch picker upward: filter as you type, switch, or create and switch, with git’s own refusal shown.',
        },
      },
      {
        title: { zh: '多分支提交树', en: 'Multi-branch commit graph' },
        body: {
          zh: '按 --date-order 展开所有本地与远程分支，泳道并排；点开一行看完整 message、作者、committer、父提交、全部 refs 与文件 diff。',
          en: 'Every local and remote branch in --date-order, drawn as parallel lanes. Open a row for the message, author and committer, parents, every ref and the file diffs.',
        },
      },
      {
        title: { zh: '变更与提交', en: 'Changes and commits' },
        body: {
          zh: '已暂存、未暂存、未跟踪、冲突四组，整组或逐文件勾选；丢弃要过 UI 弹框与 Host 的 confirm 两道确认，提交支持 Cmd/Ctrl+Enter。',
          en: 'Staged, unstaged, untracked and conflicted groups, selected by file or as a group. Discard needs the dialog and the Host’s confirm check; Cmd/Ctrl+Enter commits.',
        },
      },
      {
        title: { zh: '右键历史操作', en: 'Right-click history actions' },
        body: {
          zh: '提交节点右键：复制 SHA、拣选到当前分支、撤销此提交、删除此提交；分支行右键：把该分支合并进来，或把当前分支变基过去。不满足条件的项留在菜单里并写明原因。',
          en: 'Right-click a commit to copy its SHA, cherry-pick it, revert it or drop it; right-click a branch to merge it in or rebase onto it. Entries a snapshot cannot allow stay in the menu with the reason.',
        },
      },
      {
        title: { zh: '分支与工作树', en: 'Branches and worktrees' },
        body: {
          zh: '本地 / 工作树 / 远程三段，点标题折叠；新建、切换、移除与 prune 都是行内图标按钮。新工作树默认落在 .agents/worktrees/，并补上忽略文件。',
          en: 'Local, worktree and remote sections that fold at the header; create, switch, remove and prune are inline icon buttons. New worktrees default to .agents/worktrees/ and get the ignore marker.',
        },
      },
      {
        title: { zh: '窄栏优先', en: 'Narrow first' },
        body: {
          zh: '按面板自身宽度排版而不是窗口宽度：窄时单列、该省略的省略，不会出现横向滚动条；右栏全屏后变更页回到两栏。',
          en: 'It lays out against its own width, not the window: one column when squeezed, ellipsis where it can, and no horizontal scrollbar. Fullscreen the sidebar and the Changes tab splits in two again.',
        },
      },
    ],
    tools: gitTools,
    config: [
      { field: 'refs', value: 'all', desc: { zh: 'all 追踪全部分支；head 只追踪当前分支', en: 'all walks every branch; head walks only the current one' } },
      { field: 'maxCommits', value: '200', desc: { zh: '提交图抓取的提交数，20 到 500', en: 'Commits fetched for the graph, 20 to 500' } },
      { field: 'maxDiffBytes', value: '400000', desc: { zh: '单个补丁返回给浏览器的字节上限，超出截断并提示', en: 'Byte budget for one patch sent to the browser; larger patches are truncated with a notice' } },
      { field: 'commandTimeoutMs', value: '15000', desc: { zh: '单次 git 调用的超时，500 到 120000', en: 'Timeout for one git invocation, 500 to 120000' } },
    ],
    security: [
      { zh: '工作区白名单：写操作只认工作区 id，读快照还可给会话目录；git 的 cwd 始终取注册路径。', en: 'Workspace allowlist: mutations take a workspace id, a snapshot read may name the Session directory, and git always runs from the registered path.' },
      { zh: "无 shell：execFile('git', args)，参数逐个传递，分支名与提交信息无法被解释成命令。", en: 'No shell: execFile(‘git’, args) passes one argument per entry, so branch names and messages cannot become syntax.' },
      { zh: '路径校验：assertRelativePath 拒绝空串、绝对路径、.. 段与 NUL；工作树路径必须落在工作区内、不在 .git 内且尚不存在。', en: 'Path validation: assertRelativePath refuses empty strings, absolute paths, .. segments and NUL; a worktree path must stay inside the workspace, outside .git, and not exist yet.' },
      { zh: '鉴权前置：路由先跑 connection.requestRejection，未通过时连工作区列表都不返回。', en: 'Authorisation first: the route runs connection.requestRejection before returning even the workspace list.' },
      { zh: '历史操作前置校验：HEAD 在分支上、工作区无已暂存/未暂存改动、没有进行中的合并或变基；drop 还要求 confirm: true 且拒绝根提交、合并提交与含合并的重写范围。', en: 'History preconditions: attached HEAD, no tracked changes, no stopped operation; drop also needs confirm: true and refuses a root or merge commit and any range containing merges.' },
      { zh: '冲突自动中止：merge / rebase / cherry-pick / revert 遇到冲突先跑对应 --abort，再返回结构化错误，仓库回到操作前状态。', en: 'Conflicts abort themselves: merge, rebase, cherry-pick and revert run the matching --abort first, then return a structured error.' },
      { zh: '破坏性操作两次确认：丢弃改动、移除工作树、删除提交都是 UI 弹框 + Host 的 confirm: true；丢弃还会复查路径仍处于变更状态。', en: 'Destructive work needs two confirmations: the dialog plus confirm: true on the request; discarding re-reads status to prove the path is changed.' },
    ],
    limits: [
      { zh: '不做网络操作：没有 fetch、pull、push、clone。', en: 'No network operations: no fetch, pull, push or clone.' },
      { zh: '不做 stash，也不做冲突解决：历史操作遇到冲突自动中止，没有 continue / skip / 冲突编辑器。', en: 'No stash and no conflict resolution: history actions abort on conflict, with no continue, skip or conflict editor.' },
      { zh: 'rebase 用 git 默认行为，重放范围内的合并提交会被压平；drop 遇到这种范围直接拒绝。', en: 'Rebase uses git’s default, so merge commits in the replayed range are flattened; drop refuses such a range outright.' },
      { zh: '右键菜单靠鼠标右键或触屏长按打开；提交行与分支行没有额外的「更多」按钮入口。', en: 'Context menus open by right-click or touch long-press; commit and branch rows have no extra “more” button.' },
      { zh: '分支胶囊只列本地分支；面板不移动会话目录，新工作树要你自己进去开会话。', en: 'The chip lists local branches only; the panel never moves the Session’s directory, so you enter a new worktree yourself.' },
      { zh: '提交历史一次最多 500 条，文件列表一次最多 400 个。', en: 'At most 500 commits and 400 changed files per response.' },
      { zh: '泳道超过 8 条会折叠并提示；泳道配色是固定 8 色，其余颜色来自宿主主题令牌。', en: 'More than eight lanes are folded with a notice; lane colours are a fixed eight-hue palette and everything else comes from host theme tokens.' },
    ],
  },
  {
    slug: 'dsh-context7',
    packageName: '@litingyes/dsh-context7',
    runtime: {
      zh: '连接全部是配置；Host 半边只有展示与那段常驻引导。',
      en: 'The connection is all configuration; the Host half is presentation plus the guidance.',
    },
    icon: '/icons/dsh-context7.svg',
    name: { zh: 'Context7 文档查询', en: 'Context7 documentation' },
    tagline: {
      zh: '把 Context7 的官方 MCP 接进对话，让智能体先查文档再回答。',
      en: 'Connects the official Context7 MCP server so the agent reads current docs before answering.',
    },
    summary: {
      zh: '两个工具：库名解析成 library ID，再取最新文档与代码示例。插件还补了一段常驻的触发引导。',
      en: 'Two doc tools and the paragraph that gets them used.',
    },
    install:
      installCommand('dsh-context7'),
    installNote: {
      zh: '装完刷新页面；改动引导段落属于 Host 代码，要重新加载插件行或重启 Host。',
      en: 'Refresh the page after installing. The guidance paragraph is Host code, so reload the plugin row or restart the Host after changing it.',
    },
    requirements: [
      { zh: `DSH ${dshRange('dsh-context7')}`, en: `DSH ${dshRange('dsh-context7')}` },
      { zh: '能访问 https://mcp.context7.com/mcp', en: 'Network access to https://mcp.context7.com/mcp' },
      { zh: '可选：CONTEXT7_API_KEY 提高额度', en: 'Optional: CONTEXT7_API_KEY for a higher quota' },
    ],
    signal: 'cool',
    readme: 'https://github.com/litingyes/dsh-plugins/blob/release/dsh-context7/README.md',
    features: [
      {
        title: { zh: '两个工具', en: 'Two tools' },
        body: {
          zh: 'resolve-library-id 把库名解析成 library ID，query-docs 按 ID 取与问题相关的最新文档与示例。',
          en: 'resolve-library-id turns a library name into a library ID; query-docs fetches the current documentation and examples for it.',
        },
      },
      {
        title: { zh: '对话里的工具行', en: 'A row in the conversation' },
        body: {
          zh: '纯展示的浏览器半把默认工具卡片换成 Context7 标志行，点开是请求参数与返回的文档；工具行为、名称与结果都不变。',
          en: 'A presentation-only browser half replaces the default tool card with a Context7 mark row, expandable to the request and the returned docs. Behaviour, names and results do not change.',
        },
      },
      {
        title: { zh: '常驻触发引导', en: 'An always-on trigger' },
        body: {
          zh: '在 MCP 客户端那段提示之后补一条，点名两个工具；渲染前用 tools.get 检查工具是否注册，未注册就整段消失。',
          en: 'One paragraph after the MCP client’s own section, naming both tools. Before rendering it asks tools.get whether they are registered, and disappears when they are not.',
        },
      },
      {
        title: { zh: '使用观测', en: 'Usage you can measure' },
        body: {
          zh: 'scripts/usage-report.mjs 统计本机会话的 tool/call，把“感觉触发少”变成可比较的数字。',
          en: 'scripts/usage-report.mjs counts tool/call events across local sessions, turning “it feels underused” into a number you can compare.',
        },
      },
    ],
    tools: context7Tools,
    config: [
      { field: 'serverName', value: 'context7', desc: { zh: '连接行与引导行必须一致；改名后工具前缀跟着变', en: 'The connection row and the guidance row must agree; renaming changes the tool prefix' } },
      { field: 'transport', value: 'streamable-http', desc: { zh: '固定连到 https://mcp.context7.com/mcp', en: 'Points at https://mcp.context7.com/mcp' } },
      { field: 'failOnStartupError', value: 'true', desc: { zh: '连不上时明确报失败；false 交给重连在后台恢复', en: 'Fail loudly when unreachable; false leaves recovery to the reconnect policy' } },
      { field: 'toolCallTimeoutMs', value: '60000', desc: { zh: 'Context7 检索较重时可以调大', en: 'Raise it when Context7 retrieval is slow' } },
      { field: 'guidance', value: 'true', desc: { zh: '引导行开关；false 只关掉常驻提示，工具与展示不受影响', en: 'The guidance row switch; false removes only the paragraph, not the tools or the rows' } },
    ],
    security: [],
    limits: [
      { zh: '依赖远端服务：离线或 Context7 不可达时工具不可用，引导段落随之隐藏。', en: 'Depends on a remote service: offline or unreachable, the tools disappear and the guidance hides with them.' },
      { zh: '不支持 OAuth：DSH 的 MCP 客户端未实现 OAuth，只能 API key 或匿名访问。', en: 'No OAuth: the DSH MCP client does not implement it, so it is an API key or anonymous access.' },
      { zh: '数据外发：查询内容离开本机，额度与计费以 Context7 账户为准。', en: 'Data egress: queries leave the machine, and quota and billing follow the Context7 account.' },
      { zh: '核心提示里的 resource 行对 Context7 是死路，插件删不掉，只能靠引导把路径指回工具。', en: 'The core MCP resource line is a dead end for Context7; the plugin cannot remove it and routes around it with the guidance.' },
      { zh: '叠装同名 skill 会分流触发；引导段落每次请求约 90 tokens，可用 guidance: false 关掉。', en: 'Overlapping skills siphon triggers; the paragraph costs about 90 tokens per request and guidance: false turns it off.' },
    ],
  },
]

/** The numbers the Context7 plugin measured on its author's machine. */
export const context7Story = {
  title: { zh: '装上工具，模型却不用', en: 'Installed, and still unused' } as L,
  lead: {
    zh: '作者在自己机器上统计了 57 个会话、5,527 次 tool/call。',
    en: 'The author counted 57 sessions and 5,527 tool/call events on his own machine.',
  } as L,
  figures: [
    { value: '0.33%', label: { zh: '两个工具在全部工具调用里的占比', en: 'of all tool calls reached the two tools' } as L },
    { value: '18', label: { zh: '5,527 次调用里被调用的次数', en: 'calls out of 5,527, several of them by the author testing' } as L },
    { value: '2/26', label: { zh: '装后 22.6 小时里主动用过的会话', en: 'sessions used it unprompted in the 22.6 hours after install' } as L },
  ],
  causes: [
    {
      title: { zh: '系统提示里没有工具名', en: 'The system prompt never names the tools' } as L,
      body: {
        zh: 'MCP 客户端把服务端返回的 instructions 原样贴成一段，话术很强，却从不提 mcp__context7__* 这两个可调用的名字。',
        en: 'The MCP client republishes the server’s instructions verbatim. Strong prose, but it never mentions the two callable names under mcp__context7__.',
      } as L,
    },
    {
      title: { zh: '它排在记忆与 web_fetch 后面', en: 'It queues behind memory and web_fetch' } as L,
      body: {
        zh: '同一窗口里 287 次 bash 读 node_modules、23 次 npm 查询，Context7 只有 15 次；web_fetch 还有 38% 的调用失败。',
        en: 'In the same window: 287 bash reads of node_modules, 23 npm lookups, 15 Context7 calls, and web_fetch failing 38% of the time.',
      } as L,
    },
    {
      title: { zh: '手装的 skill 会分流', en: 'Hand-installed skills siphon it' } as L,
      body: {
        zh: 'context7-mcp 只写不带 mcp__ 前缀的名字，find-docs 指向 npx ctx7 命令；那条命令在所有会话里执行 0 次。',
        en: 'context7-mcp names the tools without the mcp__ prefix, and find-docs points at the npx ctx7 command, which ran 0 times across all sessions.',
      } as L,
    },
  ],
}

/** The guidance paragraph the plugin adds, quoted verbatim from its source. */
export const context7Guidance = {
  title: { zh: '插件补上的那一段', en: 'The paragraph the plugin adds' } as L,
  lead: {
    zh: 'index.js 在 MCP 客户端那段之后补一段（顺序 3101），点名两个工具，并给出唯一该跳过的情形。',
    en: 'index.js appends one section after the MCP client’s own (order 3101). It names both tools and gives the one case to skip them.',
  } as L,
  quote:
    'call mcp__context7__resolve-library-id and then mcp__context7__query-docs before answering from memory or fetching documentation with web_fetch. Skip both when the answer is in this workspace’s own code or in the installed package’s types.',
  facts: [
    { zh: '约 360 字符，每次请求约 90 tokens，对每个 Agent 与子代理生效。', en: 'About 360 characters, roughly 90 tokens per request, applied to every Agent and subagent.' } as L,
    { zh: '自愈：渲染前查 tools.get，工具没注册就返回空串，整段消失。', en: 'Self-healing: it asks tools.get first and returns an empty string when the tools are not registered.' } as L,
    { zh: '可以用 context7-ui 行的 guidance: false 单独关掉，工具与展示不受影响。', en: 'guidance: false on the context7-ui row turns off just this paragraph.' } as L,
  ],
}

/** Shared chrome copy used by the plugin pages. */
export const pageCopy = {
  back: { zh: '全部插件', en: 'All plugins' } as L,
  install: { zh: '安装', en: 'Install' } as L,
  copy: { zh: '复制', en: 'Copy' } as L,
  copied: { zh: '已复制', en: 'Copied' } as L,
  requirements: { zh: '前提', en: 'Requirements' } as L,
  features: { zh: '功能', en: 'What it does' } as L,
  tools: { zh: '智能体工具', en: 'Agent tools' } as L,
  config: { zh: '配置', en: 'Configuration' } as L,
  security: { zh: '安全模型', en: 'Security model' } as L,
  limits: { zh: '限制', en: 'Limits' } as L,
  readme: { zh: '完整 README', en: 'Full README' } as L,
  graphNote: {
    zh: '本仓库的真实提交，用插件的 layoutGraph 排版。展开任意一行看详情。',
    en: 'Real commits from this repository, laid out by the plugin’s own layoutGraph. Open any row for the details.',
  } as L,
  graphFilterAll: { zh: '全部分支', en: 'All branches' } as L,
  graphFilterCurrent: { zh: '仅当前分支', en: 'Current branch' } as L,
  graphSearch: { zh: '搜索提交、作者或 SHA', en: 'Search subject, author or SHA' } as L,
  graphCount: { zh: '个提交', en: 'commits' } as L,
  open: { zh: '查看详情', en: 'Details' } as L,
  branchesTitle: { zh: '分支', en: 'Branches' } as L,
  branchesNote: {
    zh: '来自本仓库的 git branch，不是示例数据。',
    en: 'From this repository’s git branches, not sample data.',
  } as L,
  files: { zh: '个文件变更', en: 'files changed' } as L,
  diff: { zh: '补丁', en: 'Patch' } as L,
  message: { zh: '提交信息', en: 'Commit message' } as L,
}
