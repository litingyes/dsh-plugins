/**
 * Filesystem IO for `@litingyes/dsh-director`, on top of `ctx.fs`.
 *
 * The store is the only place the Host touches disk. It owns three things the
 * pure domain layer cannot: where the production lives, how a file is read with
 * a version, and how a write is refused when the file moved underneath the
 * agent. `ctx.fs` is used rather than `node:fs` so the session's sandbox governs
 * every mutation, and so a write is atomic.
 *
 * Optimistic concurrency: a load records each file's `version`; a mutation
 * writes with that version, and a stale version becomes `VIDEO_STALE` with the
 * recovery step ("read, then retry") instead of silently overwriting a change
 * the user made in an editor.
 *
 * @module @litingyes/dsh-director/store
 */

import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  FILE_NAMES,
  VideoError,
  parseAudioText,
  parseProjectText,
  parseStoryboardText,
} from './production.js'

/** File order used by init and by the panel's "missing" list. */
export const PRODUCTION_FILES = [FILE_NAMES.project, FILE_NAMES.storyboard, FILE_NAMES.audio]

/**
 * Resolve the production directory for one session cwd.
 *
 * The row config's `root` is already validated as a relative path without
 * `..`, but containment is re-checked here because `cwd` is runtime input.
 *
 * @param {string} cwd Session working directory.
 * @param {string} root configured relative directory.
 * @returns {{ cwd: string, rootDir: string, files: Record<string, string> }} paths.
 */
export function productionPaths(cwd, root) {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new VideoError('VIDEO_NO_AGENT', 'this tool needs a Session with a working directory')
  }
  const base = resolve(cwd)
  const rootDir = resolve(base, root)
  const rel = relative(base, rootDir)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new VideoError(
      'VIDEO_PATH_ESCAPE',
      `the production root "${root}" resolves outside the Session working directory`,
    )
  }
  return {
    cwd: base,
    rootDir,
    files: {
      [FILE_NAMES.project]: join(rootDir, FILE_NAMES.project),
      [FILE_NAMES.storyboard]: join(rootDir, FILE_NAMES.storyboard),
      [FILE_NAMES.audio]: join(rootDir, FILE_NAMES.audio),
    },
  }
}

/** Turn a provider failure into a model-facing refusal without losing the code. */
function wrapFsError(error, action, displayPath) {
  if (error instanceof VideoError) throw error
  const code = typeof error?.code === 'string' ? error.code : ''
  const detail = error instanceof Error ? error.message : String(error)
  if (code === 'FS_SANDBOX_DENIED' || code === 'FS_PERMISSION_DENIED') {
    throw new VideoError(
      'VIDEO_FS',
      `cannot ${action} "${displayPath}": the filesystem denied it (${code}); ask the user for access to this workspace`,
      { code, detail },
    )
  }
  throw new VideoError('VIDEO_FS', `cannot ${action} "${displayPath}": ${detail}`, { code, detail })
}

/**
 * Read one file with its version. Absent is a normal answer, not an error.
 *
 * @param {object} fs `ctx.fs`.
 * @param {string} absPath absolute file path.
 * @param {{ cwd: string, signal?: AbortSignal }} options resolve context.
 * @returns {Promise<{ content: string, version: string } | null>} file record or null.
 */
async function readOne(fs, absPath, options) {
  let target
  try {
    target = await fs.resolve(absPath, { cwd: options.cwd, signal: options.signal })
  } catch (error) {
    wrapFsError(error, 'read', absPath)
  }
  let info
  try {
    info = await fs.stat(target, options.signal)
  } catch (error) {
    wrapFsError(error, 'read', absPath)
  }
  if (info === undefined || info === null) return null
  if (info.type !== 'file') {
    throw new VideoError('VIDEO_FS', `cannot read "${absPath}": it is not a regular file`)
  }
  let content
  try {
    content = await fs.readText(target, options.signal)
  } catch (error) {
    wrapFsError(error, 'read', absPath)
  }
  return { content, version: info.version }
}

/**
 * Load the whole production. Missing files are `null`; unreadable content is
 * recorded in `errors` so the review and the panel can report it instead of
 * failing the whole read.
 *
 * @param {{
 *   fs: object,
 *   cwd: string,
 *   root: string,
 *   signal?: AbortSignal,
 * }} options plugin IO context.
 * @returns {Promise<object>} `{ paths, project, storyboard, audio, versions, errors }`.
 */
export async function loadProduction(options) {
  const paths = productionPaths(options.cwd, options.root)
  const result = {
    paths,
    project: null,
    storyboard: null,
    audio: null,
    versions: {},
    errors: {},
  }
  const readers = [
    [FILE_NAMES.project, parseProjectText, 'project'],
    [FILE_NAMES.storyboard, parseStoryboardText, 'storyboard'],
    [FILE_NAMES.audio, parseAudioText, 'audio'],
  ]
  for (const [name, parse, key] of readers) {
    const record = await readOne(options.fs, paths.files[name], options)
    if (record === null) continue
    result.versions[name] = record.version
    try {
      result[key] = parse(record.content)
    } catch (error) {
      if (error instanceof VideoError) {
        result.errors[name] = error.message
      } else {
        result.errors[name] = error instanceof Error ? error.message : String(error)
      }
    }
  }
  return result
}

/** Serialize one production file the way the repository writes data. */
function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * Write one file with an expected version.
 *
 * @param {{
 *   fs: object,
 *   cwd: string,
 *   absPath: string,
 *   data: object,
 *   expected?: { version: string } | { kind: 'createIfAbsent' },
 *   signal?: AbortSignal,
 * }} options write request.
 * @returns {Promise<string>} the new version.
 */
async function writeOne(options) {
  let target
  try {
    target = await options.fs.resolve(options.absPath, { cwd: options.cwd, signal: options.signal })
  } catch (error) {
    wrapFsError(error, 'write', options.absPath)
  }
  try {
    const outcome = await options.fs.writeText(
      target,
      serialize(options.data),
      options.expected,
      options.signal,
    )
    return typeof outcome?.version === 'string' ? outcome.version : ''
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : ''
    if (code === 'FS_STALE_VERSION' || code === 'FS_NOT_OBSERVED') {
      throw new VideoError(
        'VIDEO_STALE',
        `cannot write "${options.absPath}": the file changed since it was read — re-read the production, then retry`,
        { code },
      )
    }
    wrapFsError(error, 'write', options.absPath)
  }
}

/**
 * Create a production. `project.json` is written last and is the marker: if it
 * already exists this refuses, and a partially created directory can be
 * completed by running init again.
 *
 * @param {{
 *   fs: object, cwd: string, root: string, signal?: AbortSignal,
 *   project: object, storyboard: object, audio: object,
 * }} options new production.
 * @returns {Promise<{ paths: object, versions: Record<string, string> }>} result.
 */
export async function initProduction(options) {
  const paths = productionPaths(options.cwd, options.root)
  const existing = await readOne(options.fs, paths.files[FILE_NAMES.project], options)
  if (existing !== null) {
    throw new VideoError(
      'VIDEO_PROJECT_EXISTS',
      `a production already exists at "${paths.files[FILE_NAMES.project]}"; use video_project with action "read" or "update"`,
    )
  }
  const versions = {}
  const pairs = [
    [FILE_NAMES.storyboard, options.storyboard],
    [FILE_NAMES.audio, options.audio],
    [FILE_NAMES.project, options.project],
  ]
  for (const [name, data] of pairs) {
    const absPath = paths.files[name]
    const current = await readOne(options.fs, absPath, options)
    if (current !== null) {
      // Leave an existing file alone; init only fills what is missing.
      versions[name] = current.version
      if (name === FILE_NAMES.project) {
        throw new VideoError(
          'VIDEO_PROJECT_EXISTS',
          `a production already exists at "${absPath}"; use video_project with action "read" or "update"`,
        )
      }
      continue
    }
    versions[name] = await writeOne({
      fs: options.fs,
      cwd: options.cwd,
      absPath,
      data,
      expected: { kind: 'createIfAbsent' },
      signal: options.signal,
    })
  }
  return { paths, versions }
}

/**
 * Persist one of the three files after a mutation.
 *
 * @param {{
 *   fs: object, cwd: string, root: string, signal?: AbortSignal,
 *   file: string, data: object, version: string | undefined,
 * }} options update request.
 * @returns {Promise<string>} new version.
 */
export async function saveFile(options) {
  const paths = productionPaths(options.cwd, options.root)
  const absPath = paths.files[options.file]
  if (absPath === undefined) {
    throw new VideoError('VIDEO_FS', `unknown production file "${options.file}"`)
  }
  if (typeof options.version !== 'string' || options.version === '') {
    throw new VideoError('VIDEO_STALE', `cannot write "${absPath}": no version was read first — re-read the production, then retry`)
  }
  return writeOne({
    fs: options.fs,
    cwd: options.cwd,
    absPath,
    data: options.data,
    expected: { version: options.version },
    signal: options.signal,
  })
}

/**
 * Whether one project-relative path exists inside the production directory.
 * Used by the review's "referenced file missing" rules.
 *
 * @param {{
 *   fs: object, cwd: string, rootDir: string, signal?: AbortSignal,
 *   relativePath: string,
 * }} options lookup.
 * @returns {Promise<boolean>} existence.
 */
export async function fileExists(options) {
  const segments = options.relativePath.split('/')
  const absPath = join(options.rootDir, ...segments)
  const rel = relative(options.rootDir, absPath)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false
  let target
  try {
    target = await options.fs.resolve(absPath, { cwd: options.cwd, signal: options.signal })
  } catch {
    return false
  }
  try {
    const info = await options.fs.stat(target, options.signal)
    return info !== undefined && info !== null && info.type === 'file'
  } catch {
    return false
  }
}
