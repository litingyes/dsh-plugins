/**
 * Panel dictionaries.
 *
 * The plugin registers these with the Client locale service, so `t` follows the
 * user's language preference and re-renders live when it changes. The module is
 * plain data plus one resolver, so the build has no work to do here.
 *
 * @module @litingyes/dsh-git/client/i18n
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-git'

export const zh = {
  'panel.title': 'Git',
  'panel.subtitle': '工作区 Git',
  'panel.refresh': '刷新',
  'panel.loading': '正在读取仓库…',
  'panel.retry': '重试',
  'panel.noWorkspace': '还没有注册工作区。先在 DSH 中打开一个目录。',
  'panel.noSessionDir': '这个会话还没有工作区目录。',
  'panel.outsideWorkspace': '这个会话的目录不在任何已注册工作区内，侧栏不会读取它。',
  'panel.notRepo': '这个工作区不是 Git 仓库。',
  'panel.emptyRepo': '仓库还没有任何提交。',
  'panel.defaultBranch': '（无分支）',
  'panel.branchInWorktree': '这个分支已在另一个工作树中检出，先移除那个工作树再切换。',
  'panel.unknownWorktree': '这个工作树已经不存在了，列表已刷新。',
  'panel.worktreeInUse': '这个工作树仍在使用中：它被锁定，或正被当前面板读取。',
  'panel.worktreeExists': '目标路径已经存在，换一个工作树路径。',
  'panel.invalidWorktreePath': '工作树路径不合法：必须落在工作区内，且不能在 .git 里。',

  'tab.title': 'Git',
  'guide.title': '工作区 Git',
  'guide.description': '查看、暂存并提交这个会话工作区的变更',

  'tab.graph': '提交图',
  'tab.changes': '变更',
  'tab.branches': '分支',

  'graph.allRefs': '全部分支',
  'graph.headOnly': '仅当前分支',
  'graph.search': '搜索提交、作者或 SHA',
  'graph.count': '{n} 个提交',
  'graph.badgeHead': 'HEAD',
  'graph.badgeTag': '标签',
  'graph.copySha': '复制 SHA',
  'graph.copied': '已复制',
  'graph.expand': '展开详情',
  'graph.collapse': '收起',
  'graph.detailLoading': '正在读取提交…',
  'graph.message': '提交信息',
  'graph.author': '作者',
  'graph.committer': '提交者',
  'graph.parents': '父提交',
  'graph.files': '变更文件',
  'graph.noFiles': '该提交没有文件变更。',
  'graph.filesTruncated': '文件过多，仅显示前 {n} 个。',
  'graph.showFile': '查看此文件在该提交中的差异',
  'graph.overflow': '分支过多，泳道已折叠。',

  'changes.staged': '已暂存',
  'changes.unstaged': '未暂存',
  'changes.untracked': '未跟踪',
  'changes.conflicted': '冲突',
  'changes.none': '工作区干净，没有待处理的变更。',
  'changes.stage': '暂存',
  'changes.unstage': '取消暂存',
  'changes.discard': '丢弃',
  'changes.discardTitle': '丢弃这些改动？',
  'changes.discardBody': '将永久丢弃所选文件的本地修改；未跟踪文件会被删除。此操作无法撤销。',
  'changes.confirm': '确认丢弃',
  'changes.cancel': '取消',
  'changes.selectFile': '选择左侧文件查看差异',
  'changes.messagePlaceholder': '填写提交信息…',
  'changes.commit': '提交',
  'changes.commitAndPush': '提交',
  'changes.nothingStaged': '没有已暂存的改动',
  'changes.selectAll': '全选',
  'changes.clear': '清空',

  'diff.staged': '已暂存',
  'diff.worktree': '未暂存',
  'diff.commit': '提交',
  'diff.binary': '二进制文件，不显示补丁内容。',
  'diff.truncated': '补丁过大，已截断到 {n} 字节。',
  'diff.empty': '没有差异。',
  'diff.loading': '正在读取差异…',

  'branches.local': '本地分支',
  'branches.remote': '远程分支',
  'branches.current': '当前',
  'branches.switch': '切换',
  'branches.create': '新建分支',
  'branches.createPlaceholder': '新分支名，例如 feat/git-panel',
  'branches.createAction': '创建并切换',
  'branches.none': '没有本地分支。',
  'branches.upstream': '跟踪',

  'branch.title': '切换分支',
  'branch.chipLabel': '切换 Git 分支',
  'branch.search': '搜索本地分支',
  'branch.newPlaceholder': '新分支名',
  'branch.current': '当前',
  'branch.detachedHint': '当前处于分离 HEAD，选择一个本地分支即可回到分支上。',
  'branch.none': '没有可切换的本地分支。',
  'branch.noMatch': '没有匹配的分支。',
  'branch.dirty': '{n} 个文件有未提交的改动',
  'branch.switching': '正在切换分支…',

  'groups.expand': '展开',
  'groups.collapse': '收起',

  'worktree.title': '工作树',
  'worktree.current': '当前',
  'worktree.locked': '已锁定',
  'worktree.prunable': '可清理',
  'worktree.detached': '分离 HEAD',
  'worktree.bare': '裸仓库',
  'worktree.badge': '工作树',
  'worktree.create': '新建工作树',
  'worktree.prune': '清理记录',
  'worktree.copyPath': '复制路径',
  'worktree.inUse': '已在工作树 {path} 中检出',
  'worktree.remove': '移除',
  'worktree.removeBlocked': '主工作树和当前工作树不能移除。',
  'worktree.createTitle': '新建工作树',
  'worktree.branchLabel': '分支名',
  'worktree.branchPlaceholder': '例如 feat/git-worktree',
  'worktree.pathLabel': '路径',
  'worktree.pathPlaceholder': '.agents/worktrees/feat-git-worktree',
  'worktree.pathHint': '相对工作区根目录；留空则使用默认路径。',
  'worktree.modeLabel': '模式',
  'worktree.modeNew': '新建分支',
  'worktree.modeExisting': '检出已有分支',
  'worktree.createAction': '创建工作树',
  'worktree.cancel': '取消',
  'worktree.removeTitle': '移除这个工作树？',
  'worktree.removeBody': '工作树目录会被删除，分支本身保留。',
  'worktree.forceLabel': '强制移除',
  'worktree.forceHint': '该工作树里未提交的改动会被丢弃，且无法恢复。',

  'action.running': '正在处理…',
  'action.failed': '操作失败',
  'action.dismiss': '关闭',
}

export const en = {
  'panel.title': 'Git',
  'panel.subtitle': 'Workspace Git',
  'panel.refresh': 'Refresh',
  'panel.loading': 'Reading repository…',
  'panel.retry': 'Retry',
  'panel.noWorkspace': 'No workspace is registered yet. Open a directory in DSH first.',
  'panel.noSessionDir': 'This session has no workspace directory.',
  'panel.outsideWorkspace': 'This session’s directory is outside every registered workspace, so the sidebar will not read it.',
  'panel.notRepo': 'This workspace is not a git repository.',
  'panel.emptyRepo': 'This repository has no commits yet.',
  'panel.defaultBranch': '(no branch)',
  'panel.branchInWorktree': 'That branch is already checked out in another worktree; remove that worktree before switching.',
  'panel.unknownWorktree': 'That worktree no longer exists; the list has been refreshed.',
  'panel.worktreeInUse': 'That worktree is still in use: it is locked, or this panel reads it.',
  'panel.worktreeExists': 'The target path already exists; pick another worktree path.',
  'panel.invalidWorktreePath': 'That worktree path is not valid: it must stay inside the workspace and outside .git.',

  'tab.title': 'Git',
  'guide.title': 'Workspace Git',
  'guide.description': 'Review, stage, and commit changes in this session’s workspace',

  'tab.graph': 'Graph',
  'tab.changes': 'Changes',
  'tab.branches': 'Branches',

  'graph.allRefs': 'All branches',
  'graph.headOnly': 'Current branch only',
  'graph.search': 'Search commits, authors, or SHAs',
  'graph.count': '{n} commits',
  'graph.badgeHead': 'HEAD',
  'graph.badgeTag': 'tag',
  'graph.copySha': 'Copy SHA',
  'graph.copied': 'Copied',
  'graph.expand': 'Show details',
  'graph.collapse': 'Collapse',
  'graph.detailLoading': 'Loading commit…',
  'graph.message': 'Message',
  'graph.author': 'Author',
  'graph.committer': 'Committer',
  'graph.parents': 'Parents',
  'graph.files': 'Changed files',
  'graph.noFiles': 'This commit changed no files.',
  'graph.filesTruncated': 'Too many files; showing the first {n}.',
  'graph.showFile': 'Show this file in this commit',
  'graph.overflow': 'Too many branches; lanes are folded.',

  'changes.staged': 'Staged',
  'changes.unstaged': 'Unstaged',
  'changes.untracked': 'Untracked',
  'changes.conflicted': 'Conflicted',
  'changes.none': 'The working tree is clean.',
  'changes.stage': 'Stage',
  'changes.unstage': 'Unstage',
  'changes.discard': 'Discard',
  'changes.discardTitle': 'Discard these changes?',
  'changes.discardBody':
    'Local modifications of the selected files are lost, and untracked files are deleted. This cannot be undone.',
  'changes.confirm': 'Discard',
  'changes.cancel': 'Cancel',
  'changes.selectFile': 'Pick a file on the left to see its diff',
  'changes.messagePlaceholder': 'Write a commit message…',
  'changes.commit': 'Commit',
  'changes.commitAndPush': 'Commit',
  'changes.nothingStaged': 'Nothing is staged',
  'changes.selectAll': 'Select all',
  'changes.clear': 'Clear',

  'diff.staged': 'Staged',
  'diff.worktree': 'Unstaged',
  'diff.commit': 'Commit',
  'diff.binary': 'Binary file; no patch body.',
  'diff.truncated': 'Patch is large; truncated at {n} bytes.',
  'diff.empty': 'No diff.',
  'diff.loading': 'Loading diff…',

  'branches.local': 'Local',
  'branches.remote': 'Remote',
  'branches.current': 'current',
  'branches.switch': 'Switch',
  'branches.create': 'New branch',
  'branches.createPlaceholder': 'New branch name, e.g. feat/git-panel',
  'branches.createAction': 'Create and switch',
  'branches.none': 'No local branches.',
  'branches.upstream': 'tracks',

  'branch.title': 'Switch branch',
  'branch.chipLabel': 'Switch Git branch',
  'branch.search': 'Filter local branches',
  'branch.newPlaceholder': 'New branch name',
  'branch.current': 'current',
  'branch.detachedHint': 'HEAD is detached; choose a local branch to return to branch work.',
  'branch.none': 'No local branches to switch to.',
  'branch.noMatch': 'No matching branch.',
  'branch.dirty': '{n} files with uncommitted changes',
  'branch.switching': 'Switching branch…',

  'groups.expand': 'Expand',
  'groups.collapse': 'Collapse',

  'worktree.title': 'Worktrees',
  'worktree.current': 'current',
  'worktree.locked': 'locked',
  'worktree.prunable': 'prunable',
  'worktree.detached': 'detached HEAD',
  'worktree.bare': 'bare repository',
  'worktree.badge': 'worktree',
  'worktree.create': 'New worktree',
  'worktree.prune': 'Prune',
  'worktree.copyPath': 'Copy path',
  'worktree.inUse': 'Checked out in the worktree {path}',
  'worktree.remove': 'Remove',
  'worktree.removeBlocked': 'The main and current worktrees cannot be removed.',
  'worktree.createTitle': 'New worktree',
  'worktree.branchLabel': 'Branch',
  'worktree.branchPlaceholder': 'e.g. feat/git-worktree',
  'worktree.pathLabel': 'Path',
  'worktree.pathPlaceholder': '.agents/worktrees/feat-git-worktree',
  'worktree.pathHint': 'Relative to the workspace root; leave empty for the default path.',
  'worktree.modeLabel': 'Mode',
  'worktree.modeNew': 'Create branch',
  'worktree.modeExisting': 'Check out existing branch',
  'worktree.createAction': 'Create worktree',
  'worktree.cancel': 'Cancel',
  'worktree.removeTitle': 'Remove this worktree?',
  'worktree.removeBody': 'The worktree directory is deleted; the branch itself stays.',
  'worktree.forceLabel': 'Force remove',
  'worktree.forceHint': 'Uncommitted changes in that worktree are discarded and cannot be recovered.',

  'action.running': 'Working…',
  'action.failed': 'Action failed',
  'action.dismiss': 'Dismiss',
}

/** Both dictionaries, keyed the way `ctx.locale.register` expects. */
export const DICTIONARIES = { zh, en }

/**
 * Look one key up in the dictionaries, with `{n}` interpolation.
 *
 * @param {'zh'|'en'} language resolved language.
 * @param {string} key dictionary key.
 * @param {Record<string, string|number>} [vars] interpolation values.
 * @returns {string} the translated string, or the key when unknown.
 */
export function translate(language, key, vars) {
  const dict = language === 'zh' ? zh : en
  const template = dict[key] ?? en[key] ?? key
  if (vars === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name) => String(vars[name] ?? `{${name}}`))
}

/**
 * Resolve the active language from a Client locale service.
 *
 * The service's snapshot is `{ active, locales, revision }`; `active` is the
 * language on screen. The older `id` / `locale` fields are kept as fallbacks so
 * a composition with a different locale shape still resolves instead of
 * silently falling back to the browser language.
 *
 * @param {object | undefined} locale `ctx.locale`.
 * @returns {'zh'|'en'} the language to use.
 */
export function resolveLanguage(locale) {
  let id
  try {
    const snapshot = typeof locale?.getLocale === 'function' ? locale.getLocale() : undefined
    id = snapshot?.active ?? snapshot?.id ?? snapshot?.locale
  } catch {
    id = undefined
  }
  if (typeof id !== 'string' || id === '') {
    id = typeof navigator !== 'undefined' ? navigator.language : 'en'
  }
  return String(id).toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
