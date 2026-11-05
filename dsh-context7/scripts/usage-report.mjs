#!/usr/bin/env node
/**
 * Count how often an MCP tool family is actually called across this machine's
 * DSH sessions, so "the plugin feels like it never triggers" can be a number
 * instead of a hunch.
 *
 * Reads committed session logs only (`$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd`),
 * decompresses them in memory, and folds `tool/call` events by tool name. Nothing
 * is written back to the sessions.
 *
 * Usage:
 *   node scripts/usage-report.mjs                # Context7 tools, all sessions
 *   node scripts/usage-report.mjs mcp__         # any tool prefix
 *   node scripts/usage-report.mjs context7 --since 2026-11-01
 *
 * Requires Node.js >= 24 for built-in zstd decompression.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const NEEDLE = process.argv[2] ?? 'mcp__context7__'
const sinceIndex = process.argv.indexOf('--since')
const SINCE = sinceIndex === -1 ? undefined : Date.parse(process.argv[sinceIndex + 1])

if (Number.isNaN(SINCE) || (sinceIndex !== -1 && SINCE === undefined)) {
  console.error('usage: usage-report.mjs [name-prefix] [--since YYYY-MM-DD]')
  process.exit(2)
}

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const SESSIONS = join(DSH_HOME, 'sessions')

/** Every `${session}/session*.jsonl[.zstd]` file below the sessions root. */
function* sessionFiles(root) {
  let workspaces
  try {
    workspaces = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    const workspaceDir = join(root, workspace.name)
    let sessions
    try {
      sessions = readdirSync(workspaceDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const sessionDir = join(workspaceDir, session.name)
      let names
      try {
        names = readdirSync(sessionDir)
      } catch {
        continue
      }
      for (const name of names) {
        if (!name.startsWith('session') || !name.includes('.jsonl')) continue
        yield { workspace: workspace.name, session: session.name, path: join(sessionDir, name) }
      }
    }
  }
}

const stats = { sessions: 0, withTools: 0, calls: 0, needle: 0, byTool: new Map(), bySession: [] }

for (const file of sessionFiles(SESSIONS)) {
  let text
  try {
    const raw = readFileSync(file.path)
    text = file.path.endsWith('.zstd') ? zstdDecompressSync(raw).toString('utf8') : raw.toString('utf8')
  } catch {
    continue
  }
  stats.sessions += 1
  let sessionNeedle = 0
  for (const line of text.split('\n')) {
    if (line === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type !== 'tool/call') continue
    const name = event.data?.name
    if (typeof name !== 'string') continue
    if (SINCE !== undefined && (event.time ?? 0) < SINCE) continue
    stats.calls += 1
    stats.byTool.set(name, (stats.byTool.get(name) ?? 0) + 1)
    if (name.startsWith(NEEDLE)) {
      stats.needle += 1
      sessionNeedle += 1
    }
  }
  if (sessionNeedle > 0) {
    stats.withTools += 1
    stats.bySession.push({ ...file, calls: sessionNeedle })
  }
}

const share = stats.calls === 0 ? 0 : (stats.needle / stats.calls) * 100
console.log(`sessions scanned: ${stats.sessions}`)
console.log(`tool calls:       ${stats.calls}`)
console.log(`"${NEEDLE}" calls: ${stats.needle} in ${stats.withTools} session(s) — ${share.toFixed(2)}% of all tool calls`)
console.log('')
console.log('top tools:')
for (const [name, count] of [...stats.byTool].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(count).padStart(6)}  ${name}`)
}
if (stats.bySession.length > 0) {
  console.log('')
  console.log('sessions using the needle:')
  for (const entry of stats.bySession.sort((a, b) => b.calls - a.calls)) {
    const mtime = (() => {
      try {
        return new Date(statSync(entry.path).mtimeMs).toISOString().slice(0, 16).replace('T', ' ')
      } catch {
        return 'unknown'
      }
    })()
    console.log(`  ${String(entry.calls).padStart(4)}  ${mtime}  ${entry.session}`)
  }
}
