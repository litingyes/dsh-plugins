#!/usr/bin/env node
/**
 * Create the tag that `.github/workflows/publish.yml` publishes from.
 *
 *   node scripts/release.mjs dsh-git            # tag HEAD locally
 *   node scripts/release.mjs dsh-git --push     # tag HEAD, then push branch + tag
 *
 * The tag is `<directory>-v<version>`, where the version is read from that
 * package's `package.json`. Pushing the tag runs the workflow, which publishes
 * the matching package unless that exact version is already on npm.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGES = ['dsh-context7', 'dsh-git']
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const push = argv.includes('--push')
const dir = argv.find((argument) => !argument.startsWith('--'))

if (dir === undefined || !PACKAGES.includes(dir)) {
  console.error(`usage: node scripts/release.mjs <${PACKAGES.join('|')}> [--push]`)
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
const tag = `${dir}-v${manifest.version}`

const dirty = git(['status', '--porcelain'])
if (dirty !== '') {
  fail(`working tree is not clean; commit the release first:\n${dirty}`)
}

let branch
try {
  branch = git(['symbolic-ref', '--short', 'HEAD'])
} catch {
  fail('HEAD is detached; check out the branch the release belongs to')
}

let tagExists = true
try {
  git(['rev-parse', '--verify', `refs/tags/${tag}`])
} catch {
  tagExists = false
}
if (tagExists) {
  fail(`tag ${tag} already exists; bump ${dir}/package.json or delete that tag first`)
}

const head = git(['rev-parse', '--short', 'HEAD'])
git(['tag', '-a', tag, '-m', `release ${manifest.name}@${manifest.version}`])
console.log(`release: created ${tag} at ${head} (${manifest.name}@${manifest.version})`)

const pushArgs = ['push', 'origin', branch, `refs/tags/${tag}`]

if (push) {
  console.log(`release: pushing ${branch} and ${tag}...`)
  execFileSync('git', pushArgs, { cwd: root, stdio: 'inherit' })
  console.log(
    `release: pushed; the Publish to npm workflow now handles ${manifest.name}@${manifest.version} ` +
      '(and skips it when the version is already on npm)',
  )
} else {
  console.log(`release: next, run:\n  git ${pushArgs.join(' ')}`)
}
