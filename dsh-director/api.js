/**
 * Read-only HTTP surface for the right-sidebar board.
 *
 * The panel never writes: every mutation belongs to the agent tools, which carry
 * the version guards. That leaves this route with one job — load the three JSON
 * files for a Session directory and return them with the same review the
 * `video_review` tool computes. One source of truth, two surfaces.
 *
 * Authorisation runs first and fails closed, following `dsh-git`: a Host with no
 * `connection` service (an embedded runtime, no peer auth plane) is trusted, and
 * a connection that throws is treated as unauthenticated rather than trusted.
 * `dir` must be an existing directory inside a registered workspace.
 *
 * @module @litingyes/dsh-director/api
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  FILE_NAMES,
  VideoError,
  parseAudioText,
  parseProjectText,
  parseStoryboardText,
  reviewProduction,
} from './production.js'

/** Mount point of the panel's API. */
export const API_PREFIX = '/dsh-director'

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function sendError(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } })
}

/** Send a plain-text auth failure. */
function sendText(res, status, message) {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(message)
}

/**
 * Canonicalize a path that must already exist. Returns null when it does not.
 *
 * @param {string} path absolute path.
 * @returns {Promise<string | null>} canonical path or null.
 */
async function canonical(path) {
  try {
    const resolved = await realpath(path)
    return resolved.length > 1 ? resolved.replace(/[/\\]+$/u, '') : resolved
  } catch {
    return null
  }
}

/** Whether `child` is `root` itself or below it. */
function contains(root, child) {
  if (child === root) return true
  const rel = relative(root, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Read one production file; missing is null, unreadable is an error string.
 *
 * @param {string} absPath file path.
 * @returns {Promise<{ text: string } | { missing: true } | { failure: string }>} result.
 */
async function readIfPresent(absPath) {
  try {
    return { text: await readFile(absPath, 'utf8') }
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true }
    return { failure: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Build the prefix-route handler.
 *
 * @param {{
 *   config: object,
 *   authorize?: (req: object) => number | undefined | null,
 *   workspaces: () => Array<{ id: string, title?: string, path: string }>,
 * }} options route dependencies.
 * @returns {(req: object, res: object) => Promise<void>} handler.
 */
export function createApi(options) {
  const config = options.config
  const authorize = options.authorize

  return async function handler(req, res) {
    if (typeof authorize === 'function') {
      let rejection
      try {
        rejection = authorize(req)
      } catch {
        rejection = 401
      }
      if (rejection !== undefined && rejection !== null) {
        sendText(res, rejection === 401 ? 401 : 403, rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
    }

    let url
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendError(res, 400, 'invalid_dir', 'malformed request URL')
      return
    }
    if (url.pathname !== `${API_PREFIX}/api/state`) {
      sendError(res, 404, 'not_found', `unknown endpoint: ${url.pathname}`)
      return
    }
    if (req.method !== 'GET') {
      sendError(res, 405, 'method_not_allowed', 'use GET')
      return
    }

    const requested = url.searchParams.get('dir') ?? ''
    if (!isAbsolute(requested)) {
      sendError(res, 400, 'invalid_dir', 'dir must be an absolute Session working directory')
      return
    }
    const dir = await canonical(requested)
    if (dir === null) {
      sendError(res, 400, 'invalid_dir', 'dir does not exist')
      return
    }

    const registered = options.workspaces()
    if (registered.length === 0) {
      sendError(res, 409, 'no_workspace', 'no DSH workspace is registered')
      return
    }
    const roots = []
    for (const entry of registered) {
      if (typeof entry.path !== 'string' || entry.path === '') continue
      const root = await canonical(entry.path)
      if (root !== null) roots.push(root)
    }
    if (!roots.some(root => contains(root, dir))) {
      sendError(res, 403, 'outside_workspace', 'the requested directory is not inside any registered DSH workspace')
      return
    }

    const rootDir = resolve(dir, config.root)
    if (rootDir !== dir && !contains(dir, rootDir)) {
      sendError(res, 400, 'invalid_root', `the production root "${config.root}" resolves outside the Session directory`)
      return
    }

    const files = {
      project: join(rootDir, FILE_NAMES.project),
      storyboard: join(rootDir, FILE_NAMES.storyboard),
      audio: join(rootDir, FILE_NAMES.audio),
    }
    const errors = {}
    const data = { project: null, storyboard: null, audio: null }
    const parsers = {
      project: [files.project, parseProjectText],
      storyboard: [files.storyboard, parseStoryboardText],
      audio: [files.audio, parseAudioText],
    }
    for (const [key, [absPath, parse]] of Object.entries(parsers)) {
      const record = await readIfPresent(absPath)
      if ('failure' in record) {
        sendError(res, 500, 'unreadable', `cannot read ${relative(rootDir, absPath)}: ${record.failure}`)
        return
      }
      if ('missing' in record) continue
      try {
        data[key] = parse(record.text)
      } catch (error) {
        if (error instanceof VideoError) {
          errors[FILE_NAMES[key]] = error.message
        } else {
          errors[FILE_NAMES[key]] = error instanceof Error ? error.message : String(error)
        }
      }
    }

    const exists = async relativePath => {
      if (typeof relativePath !== 'string' || relativePath === '') return false
      const segments = relativePath.split('/')
      if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return false
      const absPath = join(rootDir, ...segments)
      if (!contains(rootDir, absPath)) return false
      try {
        const info = await stat(absPath)
        return info.isFile()
      } catch {
        return false
      }
    }

    let review
    try {
      review = await reviewProduction({
        project: data.project,
        storyboard: data.storyboard,
        audio: data.audio,
        errors,
        exists,
        limits: {
          maxScenes: config.maxScenes,
          maxShotsPerScene: config.maxShotsPerScene,
          maxTakesPerShot: config.maxTakesPerShot,
          maxPromptChars: config.maxPromptChars,
          minShotSeconds: config.minShotSeconds,
          maxShotSeconds: config.maxShotSeconds,
          durationTolerance: config.durationTolerance,
        },
        includeInfo: false,
      })
    } catch (error) {
      sendError(res, 500, 'unreadable', error instanceof Error ? error.message : String(error))
      return
    }

    sendJson(res, 200, {
      ok: true,
      dir,
      root: config.root,
      missing: data.project === null && errors[FILE_NAMES.project] === undefined,
      project: data.project,
      storyboard: data.storyboard,
      audio: data.audio,
      errors,
      review,
    })
  }
}
