/**
 * Panel dictionaries and the locale resolver.
 *
 * The plugin registers these with the Client locale service, so the panel
 * follows the App language and re-renders live when it changes. Plain data plus
 * one resolver keeps the browser build trivial.
 *
 * @module @litingyes/dsh-director/client/i18n
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dsh-director'

export const zh = {
  'tab.title': '导演',
  'guide.title': 'AI 视频导演',
  'guide.description': '看分镜、复制可粘贴的提示词、检查缺口',

  'panel.refresh': '刷新',
  'panel.retry': '重试',
  'panel.loading': '正在读取项目…',
  'panel.error': '读取失败',
  'panel.noSessionDir': '这个会话还没有工作区目录，侧栏无法定位项目。',
  'panel.emptyTitle': '还没有视频项目',
  'panel.emptyBody': '在对话里告诉导演你想做什么片子，项目会出现在这里。',
  'panel.emptyHint': '例如：「我想做一条 40 秒的悬疑故事短片，用可灵」。',
  'panel.errors': '文件有问题，检查页签里能看到具体位置。',
  'panel.stale': '面板只读：改动由对话里的工具完成，点刷新获取最新状态。',

  'header.aspect': '比例',
  'header.planned': '计划',
  'header.target': '目标',
  'header.shots': '镜头',
  'header.takes': 'take',
  'header.selected': '已选',
  'header.scenes': '场',

  'tab.storyboard': '故事板',
  'tab.prompts': '提示词',
  'tab.audio': '音画',
  'tab.review': '检查',

  'status.planned': '计划',
  'status.prompt_ready': '提示词就绪',
  'status.generating': '生成中',
  'status.generated': '已生成',
  'status.selected': '已选定',
  'status.dropped': '已放弃',
  'status.other': '未知',

  'purpose.hook': '钩子',
  'purpose.setup': '铺垫',
  'purpose.turn': '转折',
  'purpose.payoff': '兑现',
  'purpose.cta': '号召',

  'storyboard.noShots': '这个场景还没有镜头。',
  'storyboard.noScenes': '还没有场景。让导演先把故事分场。',
  'storyboard.promptReady': '提示词就绪',
  'storyboard.noPrompt': '无提示词',
  'storyboard.copyPrompt': '复制提示词',
  'storyboard.takeSelected': '已选 {id}',
  'storyboard.takes': '{n} 个 take',
  'storyboard.continuity': '连续性',
  'storyboard.collapse': '收起',
  'storyboard.expand': '展开',

  'prompts.noScenes': '还没有可复制的提示词。',
  'prompts.empty': '这个镜头还没有提示词。',
  'prompts.positive': '正向提示词',
  'prompts.negative': '负向提示词',
  'prompts.params': '参数',
  'prompts.copy': '复制',
  'prompts.copied': '已复制',
  'prompts.copyScene': '复制本场',
  'prompts.copyAll': '复制全片',
  'prompts.download': '下载 .md',
  'prompts.products': '产品',
  'prompts.emptyBlock': '（空）',

  'audio.noTracks': '还没有音频方案。',
  'audio.vo': '配音',
  'audio.music': '音乐',
  'audio.sfx': '音效',
  'audio.wholeFilm': '全片',
  'audio.copyText': '复制文本',
  'audio.noText': '（无文本）',
  'audio.other': '其他',

  'review.empty': '没有发现问题。',
  'review.error': '错误',
  'review.warning': '警告',
  'review.info': '提示',
  'review.fix': '修正',
  'review.next': '下一步',
  'review.more': '还有 {n} 条未显示',
  'review.truncated': '结果已截断，先修主要问题。',
  'review.sceneFilter': '只看这场',
  'review.allScenes': '全部',

  'review.code.PROJECT_MISSING': '还没有项目',
  'review.code.STORYBOARD_MISSING': '分镜文件缺失',
  'review.code.AUDIO_MISSING': '音频文件缺失',
  'review.code.UNREADABLE_FILE': '文件无法解析',
  'review.code.SCENE_WITHOUT_SHOTS': '场景没有镜头',
  'review.code.DUPLICATE_ID': 'id 重复',
  'review.code.SHOT_INVALID_DURATION': '镜头时长越界',
  'review.code.SHOT_MISSING_ACTION': '镜头缺少动作',
  'review.code.SHOT_MISSING_PROMPT': '镜头缺少提示词',
  'review.code.PROMPT_TOO_LONG': '提示词过长',
  'review.code.PROMPT_CONTAINS_NEGATIVE_LABEL': '负向写进了正向',
  'review.code.SHOT_MISSING_PRODUCT': '未指定生成产品',
  'review.code.MISSING_ASPECT_IN_PARAMS': '参数缺比例',
  'review.code.PROMPT_DURATION_MISMATCH': '生成时长与镜头不符',
  'review.code.SELECTED_TAKE_MISSING': '有 take 未选',
  'review.code.MULTIPLE_SELECTED_TAKES': '选中了多个 take',
  'review.code.GENERATED_WITHOUT_TAKES': '已生成但没有 take',
  'review.code.MISSING_VO_FOR_DIALOGUE': '台词缺少配音',
  'review.code.CHARACTER_UNDEFINED': '角色未定义',
  'review.code.SHOT_SIZE_MISSING': '未写景别',
  'review.code.MOVEMENT_MISSING': '未写运镜',
  'review.code.VO_TOO_LONG': '配音超长',
  'review.code.UNKNOWN_AUDIO_TARGET': '音轨指向不存在的镜头',
  'review.code.NO_MUSIC': '没有音乐',
  'review.code.NO_SFX': '没有音效',
  'review.code.DURATION_DRIFT': '总时长偏离目标',
  'review.code.SCENE_PURPOSE_MISSING': '场景缺少目的',
  'review.code.MISSING_LOGLINE': '缺少一句话故事',
  'review.code.MISSING_TARGET_DURATION': '缺少目标时长',
  'review.code.UNKNOWN_STATUS': '未知镜头状态',
  'review.code.TAKE_FILE_MISSING': 'take 文件不存在',
  'review.code.REFERENCE_FILE_MISSING': '参考图不存在',
  'review.code.OTHER': '其他问题',
}

export const en = {
  'tab.title': 'Director',
  'guide.title': 'AI video director',
  'guide.description': 'Storyboard, paste-ready prompts and a production review',

  'panel.refresh': 'Refresh',
  'panel.retry': 'Retry',
  'panel.loading': 'Reading the production…',
  'panel.error': 'Could not read the production',
  'panel.noSessionDir': 'This Session has no working directory, so the board cannot find the production.',
  'panel.emptyTitle': 'No production yet',
  'panel.emptyBody': 'Tell the director what you want to make in the conversation and the production appears here.',
  'panel.emptyHint': 'For example: "I want a 40-second suspense short for Kling."',
  'panel.errors': 'Some files could not be parsed; the review tab names the spot.',
  'panel.stale': 'This board is read-only: changes happen through the conversation, so refresh to see them.',

  'header.aspect': 'aspect',
  'header.planned': 'planned',
  'header.target': 'target',
  'header.shots': 'shots',
  'header.takes': 'takes',
  'header.selected': 'selected',
  'header.scenes': 'scenes',

  'tab.storyboard': 'Storyboard',
  'tab.prompts': 'Prompts',
  'tab.audio': 'Audio',
  'tab.review': 'Review',

  'status.planned': 'planned',
  'status.prompt_ready': 'prompt ready',
  'status.generating': 'generating',
  'status.generated': 'generated',
  'status.selected': 'selected',
  'status.dropped': 'dropped',
  'status.other': 'unknown',

  'purpose.hook': 'hook',
  'purpose.setup': 'setup',
  'purpose.turn': 'turn',
  'purpose.payoff': 'payoff',
  'purpose.cta': 'cta',

  'storyboard.noShots': 'This scene has no shots yet.',
  'storyboard.noScenes': 'No scenes yet. Let the director break the story down first.',
  'storyboard.promptReady': 'prompt ready',
  'storyboard.noPrompt': 'no prompt',
  'storyboard.copyPrompt': 'Copy prompt',
  'storyboard.takeSelected': '{id} selected',
  'storyboard.takes': '{n} take(s)',
  'storyboard.continuity': 'Continuity',
  'storyboard.collapse': 'Collapse',
  'storyboard.expand': 'Expand',

  'prompts.noScenes': 'No prompts to copy yet.',
  'prompts.empty': 'This shot has no prompt yet.',
  'prompts.positive': 'Prompt',
  'prompts.negative': 'Negative',
  'prompts.params': 'Params',
  'prompts.copy': 'Copy',
  'prompts.copied': 'Copied',
  'prompts.copyScene': 'Copy scene',
  'prompts.copyAll': 'Copy all',
  'prompts.download': 'Download .md',
  'prompts.products': 'Products',
  'prompts.emptyBlock': '(empty)',

  'audio.noTracks': 'No audio plan yet.',
  'audio.vo': 'Voice-over',
  'audio.music': 'Music',
  'audio.sfx': 'Sound effects',
  'audio.wholeFilm': 'whole film',
  'audio.copyText': 'Copy text',
  'audio.noText': '(no text)',
  'audio.other': 'Other',

  'review.empty': 'No findings.',
  'review.error': 'Errors',
  'review.warning': 'Warnings',
  'review.info': 'Info',
  'review.fix': 'Fix',
  'review.next': 'Next',
  'review.more': '{n} more not shown',
  'review.truncated': 'Findings are truncated; fix the main ones first.',
  'review.sceneFilter': 'This scene only',
  'review.allScenes': 'All',

  'review.code.PROJECT_MISSING': 'No production yet',
  'review.code.STORYBOARD_MISSING': 'Storyboard missing',
  'review.code.AUDIO_MISSING': 'Audio plan missing',
  'review.code.UNREADABLE_FILE': 'File cannot be parsed',
  'review.code.SCENE_WITHOUT_SHOTS': 'Scene has no shots',
  'review.code.DUPLICATE_ID': 'Duplicate id',
  'review.code.SHOT_INVALID_DURATION': 'Shot duration out of range',
  'review.code.SHOT_MISSING_ACTION': 'Shot has no action',
  'review.code.SHOT_MISSING_PROMPT': 'Shot has no prompt',
  'review.code.PROMPT_TOO_LONG': 'Prompt too long',
  'review.code.PROMPT_CONTAINS_NEGATIVE_LABEL': 'Negative text in positive prompt',
  'review.code.SHOT_MISSING_PRODUCT': 'No generation product',
  'review.code.MISSING_ASPECT_IN_PARAMS': 'Params have no aspect',
  'review.code.PROMPT_DURATION_MISMATCH': 'Generation duration mismatch',
  'review.code.SELECTED_TAKE_MISSING': 'Takes but none selected',
  'review.code.MULTIPLE_SELECTED_TAKES': 'Multiple takes selected',
  'review.code.GENERATED_WITHOUT_TAKES': 'Generated without takes',
  'review.code.MISSING_VO_FOR_DIALOGUE': 'Dialogue without voice-over',
  'review.code.CHARACTER_UNDEFINED': 'Undefined character',
  'review.code.SHOT_SIZE_MISSING': 'No shot size',
  'review.code.MOVEMENT_MISSING': 'No camera movement',
  'review.code.VO_TOO_LONG': 'Voice-over too long',
  'review.code.UNKNOWN_AUDIO_TARGET': 'Audio targets a missing shot',
  'review.code.NO_MUSIC': 'No music',
  'review.code.NO_SFX': 'No sound effects',
  'review.code.DURATION_DRIFT': 'Duration drifts from target',
  'review.code.SCENE_PURPOSE_MISSING': 'Scene has no purpose',
  'review.code.MISSING_LOGLINE': 'No logline',
  'review.code.MISSING_TARGET_DURATION': 'No target duration',
  'review.code.UNKNOWN_STATUS': 'Unknown shot status',
  'review.code.TAKE_FILE_MISSING': 'Take file missing',
  'review.code.REFERENCE_FILE_MISSING': 'Reference file missing',
  'review.code.OTHER': 'Other finding',
}

/**
 * Look one key up in the dictionaries, with `{n}` interpolation.
 *
 * @param {'zh' | 'en'} language resolved language.
 * @param {string} key dictionary key.
 * @param {Record<string, string | number>} [vars] interpolation values.
 * @returns {string} translated text, or the key when unknown.
 */
export function translate(language, key, vars) {
  const dict = language === 'zh' ? zh : en
  const template = dict[key] ?? en[key] ?? key
  if (vars === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name) => String(vars[name] ?? `{${name}}`))
}

/**
 * Resolve the active language from the Client locale service.
 *
 * @param {object | undefined} locale `ctx.locale`.
 * @returns {'zh' | 'en'} the language to use.
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

/** Dictionaries keyed by language for `locale.register`. */
export const DICTIONARIES = { zh, en }
