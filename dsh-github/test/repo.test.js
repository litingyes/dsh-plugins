import assert from 'node:assert/strict'
import test from 'node:test'
import { GithubError, parseRemote, repoForDir } from '../github.js'

const EXPECTED = {
  owner: 'litingyes',
  name: 'dsh-plugins',
  fullName: 'litingyes/dsh-plugins',
  webUrl: 'https://github.com/litingyes/dsh-plugins',
}

test('parseRemote reads every remote form git produces', () => {
  const forms = [
    'https://github.com/litingyes/dsh-plugins',
    'https://github.com/litingyes/dsh-plugins.git',
    'https://github.com/litingyes/dsh-plugins/',
    'http://github.com/litingyes/dsh-plugins.git',
    'git@github.com:litingyes/dsh-plugins.git',
    'git@github.com:litingyes/dsh-plugins',
    'ssh://git@github.com/litingyes/dsh-plugins.git',
    'ssh://git@github.com:22/litingyes/dsh-plugins.git',
    'git://github.com/litingyes/dsh-plugins.git',
    '  https://github.com/litingyes/dsh-plugins.git\n',
  ]
  for (const form of forms) {
    assert.deepEqual(parseRemote(form), EXPECTED, `form: ${JSON.stringify(form)}`)
  }
})

test('parseRemote is case-insensitive about the host only', () => {
  assert.equal(parseRemote('https://GitHub.com/litingyes/dsh-plugins').fullName, 'litingyes/dsh-plugins')
  // The path is a case-sensitive identifier on GitHub, so it is preserved.
  assert.equal(parseRemote('https://github.com/LitingYes/DSH-Plugins').fullName, 'LitingYes/DSH-Plugins')
})

test('parseRemote refuses anything that is not a github.com owner/repo', () => {
  const rejected = [
    undefined,
    null,
    42,
    '',
    '   ',
    'https://gitlab.com/litingyes/dsh-plugins',
    'https://github.example.com/litingyes/dsh-plugins',
    'git@bitbucket.org:litingyes/dsh-plugins.git',
    'https://github.com/litingyes',
    'https://github.com/litingyes/dsh-plugins/tree/main',
    'https://github.com/litingyes/dsh-plugins.git/extra',
    'ftp://github.com/litingyes/dsh-plugins',
    '/Users/liting/Desktop/dsh-plugins',
    'https://github.com/../etc',
  ]
  for (const form of rejected) {
    assert.equal(parseRemote(form), undefined, `form: ${JSON.stringify(form)}`)
  }
})

test('repoForDir prefers origin and reports why a workspace has no repository', async () => {
  const withOrigin = async args => (args.join(' ') === 'remote get-url origin' ? 'git@github.com:o/r.git\n' : '')
  assert.deepEqual(await repoForDir(withOrigin, '/work'), {
    owner: 'o',
    name: 'r',
    fullName: 'o/r',
    webUrl: 'https://github.com/o/r',
  })

  // `origin` missing: the first configured remote is the fallback.
  const renamed = async args => {
    const joined = args.join(' ')
    if (joined === 'remote get-url origin') throw new Error('no such remote')
    if (joined === 'remote') return 'upstream\n'
    if (joined === 'remote get-url upstream') return 'https://github.com/u/r.git\n'
    throw new Error(`unexpected: ${joined}`)
  }
  assert.equal((await repoForDir(renamed, '/work')).fullName, 'u/r')

  const none = async () => {
    throw new Error('not a git repository')
  }
  await assert.rejects(repoForDir(none, '/work'), error => {
    assert.ok(error instanceof GithubError)
    assert.equal(error.code, 'no_remote')
    return true
  })

  const foreign = async args => (args.join(' ') === 'remote get-url origin' ? 'https://gitlab.com/o/r.git\n' : '')
  await assert.rejects(repoForDir(foreign, '/work'), error => {
    assert.equal(error.code, 'not_github')
    assert.equal(error.detail.remote, 'https://gitlab.com/o/r.git')
    return true
  })
})
