/**
 * Panel dictionaries.
 *
 * The plugin registers these with the Client locale service, so `t` follows the
 * user's language preference and re-renders live when it changes. The module is
 * plain data plus one resolver, so the build has no work to do here.
 *
 * @module @litingyes/dsh-github/client/i18n
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-github'

export const zh = {
  'tab.title': 'GitHub',
  'guide.title': 'GitHub',
  'guide.description': '查看这个会话所在仓库的 issue、PR 与通知',

  'panel.loading': '正在读取 GitHub…',
  'panel.loadingMore': '正在加载更多…',
  'panel.retry': '重试',
  'panel.refresh': '刷新',
  'panel.openInBrowser': '在浏览器打开',
  'panel.empty': '这里没有内容。',
  'panel.noSessionDir': '这个会话还没有工作区目录。',
  'panel.loadMore': '加载更多',

  'repo.private': '私有',
  'repo.stars': '星标',
  'repo.forks': '复刻',
  'repo.defaultBranch': '默认分支',
  'repo.manualLabel': '仓库（owner/name）',
  'repo.manualOpen': '手动指定仓库',
  'repo.manualApply': '使用',

  'tabs.issues': 'Issues',
  'tabs.pulls': 'Pull requests',
  'tabs.notifications': '通知',

  'filter.all': '全部',
  'filter.open': '打开',
  'filter.closed': '已关闭',
  'filter.assigned': '指派给我',
  'filter.created': '我创建的',
  'filter.unread': '未读',

  'list.comments': '{count} 条评论',
  'list.draft': '草稿',
  'list.updated': '更新于 {time}',
  'list.pullMeta': '{head} → {base}',
  'list.noIssues': '没有符合条件的 issue。',
  'list.noPulls': '没有符合条件的 pull request。',
  'list.noNotifications': '这个仓库没有通知。',

  'detail.back': '返回列表',
  'detail.comments': '评论',
  'detail.noComments': '还没有评论。',
  'detail.noBody': '（没有描述）',
  'detail.commentPlaceholder': '写一条评论…',
  'detail.comment': '评论',
  'detail.close': '关闭',
  'detail.reopen': '重新打开',
  'detail.merge': '合并',
  'detail.mergeNote': '合并会立即改动远端分支。',
  'detail.closeNote': '关闭后仍可以重新打开。',
  'detail.confirmTitle': '确认操作',
  'detail.confirm': '确认',
  'detail.cancel': '取消',
  'detail.mergeable': '可合并',
  'detail.notMergeable': '不可合并',
  'detail.diffStat': '+{additions} −{deletions}',
  'detail.writing': '正在提交…',

  'create.action': '新建 issue',
  'create.titlePlaceholder': '标题',
  'create.bodyPlaceholder': '描述（可选）',
  'create.submit': '创建',
  'create.cancel': '取消',

  'auth.title': '还没有配置 GitHub 令牌',
  'auth.body':
    '插件用你自己的令牌访问 GitHub。最省事的做法是直接导入 GitHub CLI 已经登录的令牌；也可以在 $DSH_HOME/.env 里写一行 GITHUB_TOKEN=<令牌>。',
  'auth.import': '从 gh 导入令牌',
  'auth.importing': '正在导入…',
  'auth.imported': '已导入 {login} 的令牌',
  'auth.configured': '已配置令牌（来源：{source}）',
  'auth.scopes': '权限：{scopes}',
  'auth.scopesMissing': '令牌缺少 repo 权限，可能读不到私有仓库。',
  'auth.envHint': 'GITHUB_TOKEN=<令牌>',
  'auth.reimport': '重新导入',

  'error.no_token': '没有可用的 GitHub 令牌。',
  'error.invalid_token': 'GitHub 令牌无效或已过期。',
  'error.no_remote': '这个会话的工作区没有 git remote。',
  'error.not_github': '这个工作区的 remote 不是 github.com。',
  'error.rate_limited': 'GitHub 限流了，{time}后再试。',
  'error.rate_limitedSoon': 'GitHub 限流了，请稍后再试。',
  'error.not_found': 'GitHub 上找不到它（也可能没有权限）。',
  'error.network': '连不上 GitHub，检查网络后重试。',
  'error.not_mergeable': '这个 pull request 现在不能合并。',
  'error.gh_missing': '没有找到 gh 命令，先安装 GitHub CLI。',
  'error.gh_not_logged_in': 'gh 还没有登录，先运行 gh auth login。',
  'error.writes_disabled': '插件被配置为只读。',
  'error.bad_request': '请求不合法。',
  'error.invalid_action': '这个操作不被支持。',
  'error.invalid_request': 'GitHub 拒绝了这个请求，检查内容后重试。',
  'error.payload_too_large': '内容太长，缩短后重试。',
  'error.github_error': 'GitHub 返回了一个错误。',
  'error.bad_response': 'GitHub 的响应读不出来。',
  'error.internal': '插件内部出错了。',
  'error.generic': '操作失败：{message}',
}

export const en = {
  'tab.title': 'GitHub',
  'guide.title': 'GitHub',
  'guide.description': "This Session's repository: its issues, pull requests and notifications",

  'panel.loading': 'Reading GitHub…',
  'panel.loadingMore': 'Loading more…',
  'panel.retry': 'Retry',
  'panel.refresh': 'Refresh',
  'panel.openInBrowser': 'Open in browser',
  'panel.empty': 'Nothing here.',
  'panel.noSessionDir': 'This Session has no working directory yet.',
  'panel.loadMore': 'Load more',

  'repo.private': 'Private',
  'repo.stars': 'Stars',
  'repo.forks': 'Forks',
  'repo.defaultBranch': 'Default branch',
  'repo.manualLabel': 'Repository (owner/name)',
  'repo.manualOpen': 'Name a repository',
  'repo.manualApply': 'Use',

  'tabs.issues': 'Issues',
  'tabs.pulls': 'Pull requests',
  'tabs.notifications': 'Notifications',

  'filter.all': 'All',
  'filter.open': 'Open',
  'filter.closed': 'Closed',
  'filter.assigned': 'Assigned to me',
  'filter.created': 'Created by me',
  'filter.unread': 'Unread',

  'list.comments': '{count} comments',
  'list.draft': 'Draft',
  'list.updated': 'updated {time}',
  'list.pullMeta': '{head} → {base}',
  'list.noIssues': 'No issues match.',
  'list.noPulls': 'No pull requests match.',
  'list.noNotifications': 'No notifications for this repository.',

  'detail.back': 'Back to the list',
  'detail.comments': 'Comments',
  'detail.noComments': 'No comments yet.',
  'detail.noBody': '(no description)',
  'detail.commentPlaceholder': 'Write a comment…',
  'detail.comment': 'Comment',
  'detail.close': 'Close',
  'detail.reopen': 'Reopen',
  'detail.merge': 'Merge',
  'detail.mergeNote': 'Merging changes the remote branch immediately.',
  'detail.closeNote': 'A closed item can be reopened.',
  'detail.confirmTitle': 'Confirm',
  'detail.confirm': 'Confirm',
  'detail.cancel': 'Cancel',
  'detail.mergeable': 'Mergeable',
  'detail.notMergeable': 'Not mergeable',
  'detail.diffStat': '+{additions} −{deletions}',
  'detail.writing': 'Submitting…',

  'create.action': 'New issue',
  'create.titlePlaceholder': 'Title',
  'create.bodyPlaceholder': 'Description (optional)',
  'create.submit': 'Create',
  'create.cancel': 'Cancel',

  'auth.title': 'No GitHub token yet',
  'auth.body':
    'The plugin uses your own token. The quickest way is to import the one the GitHub CLI already holds; you can also put GITHUB_TOKEN=<token> in $DSH_HOME/.env.',
  'auth.import': 'Import the gh token',
  'auth.importing': 'Importing…',
  'auth.imported': 'Imported the token of {login}',
  'auth.configured': 'Token configured (source: {source})',
  'auth.scopes': 'Scopes: {scopes}',
  'auth.scopesMissing': 'The token lacks the repo scope, so private repositories may be unreadable.',
  'auth.envHint': 'GITHUB_TOKEN=<token>',
  'auth.reimport': 'Import again',

  'error.no_token': 'No GitHub token is available.',
  'error.invalid_token': 'The GitHub token is invalid or expired.',
  'error.no_remote': "This Session's workspace has no git remote.",
  'error.not_github': "This workspace's remote is not github.com.",
  'error.rate_limited': 'GitHub rate-limited this client; retry after {time}.',
  'error.rate_limitedSoon': 'GitHub rate-limited this client; retry in a moment.',
  'error.not_found': 'GitHub cannot find it (or this token cannot see it).',
  'error.network': 'GitHub is unreachable; check the network and retry.',
  'error.not_mergeable': 'This pull request cannot be merged right now.',
  'error.gh_missing': 'The gh command was not found; install the GitHub CLI first.',
  'error.gh_not_logged_in': 'gh is not signed in; run gh auth login first.',
  'error.writes_disabled': 'The plugin is configured read-only.',
  'error.bad_request': 'The request was not valid.',
  'error.invalid_action': 'That action is not supported.',
  'error.invalid_request': 'GitHub refused the request; check the content and retry.',
  'error.payload_too_large': 'The content is too long; shorten it and retry.',
  'error.github_error': 'GitHub returned an error.',
  'error.bad_response': "GitHub's response could not be read.",
  'error.internal': 'The plugin hit an internal error.',
  'error.generic': 'The operation failed: {message}',
}

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
