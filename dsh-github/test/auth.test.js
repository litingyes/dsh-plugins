import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CREDENTIAL_REF, createAuth } from '../auth.js'

const TOKEN = 'gho_exampleTokenValueThatMustNeverLeak1234567890'

/** A credentials service double that records writes. */
function credentialsDouble({ configured = false, source = 'stored', describeThrows = false, setThrows = false } = {}) {
  const writes = []
  return {
    writes,
    service: {
      async describe(ref) {
        if (describeThrows) throw new Error('provider down')
        assert.equal(ref, DEFAULT_CREDENTIAL_REF)
        return { configured, source, writable: true, masked: '••••' }
      },
      async set(ref, value) {
        if (setThrows) throw new Error('read-only store')
        writes.push({ ref, value })
      },
    },
  }
}

const okFetch = (options = {}) =>
  async (url, init) => {
    assert.equal(url, 'https://api.github.com/user')
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`)
    return new Response(JSON.stringify({ login: 'litingyes' }), {
      status: options.status ?? 200,
      headers: { 'content-type': 'application/json', 'x-oauth-scopes': options.scopes ?? 'repo, workflow, read:org' },
    })
  }

const execWith = value => async (command, args) => {
  assert.equal(command, 'gh')
  assert.deepEqual(args, ['auth', 'token'])
  return { stdout: typeof value === 'string' ? `${value}\n` : value }
}

test('without a credentials service there is nothing to import into', async () => {
  const bridge = createAuth({ exec: execWith(TOKEN), fetchImpl: okFetch() })
  assert.deepEqual(await bridge.describe(), { configured: false, writable: false, importable: false })
  await assert.rejects(bridge.importFromGh(), error => {
    assert.equal(error.code, 'writes_disabled')
    return true
  })
})

test('describe reports the provider status without the value', async () => {
  const { service } = credentialsDouble({ configured: true, source: 'environment' })
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })
  const status = await bridge.describe()
  assert.deepEqual(status, { configured: true, source: 'environment', writable: true, importable: true })
  assert.ok(!JSON.stringify(status).includes(TOKEN))
})

test('describe survives a provider that throws', async () => {
  const { service } = credentialsDouble({ describeThrows: true })
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })
  const status = await bridge.describe()
  assert.equal(status.configured, false)
  assert.equal(status.importable, true)
})

test('import stores the token and returns only the login and scopes', async () => {
  const { service, writes } = credentialsDouble()
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })
  const result = await bridge.importFromGh()

  assert.deepEqual(result, { login: 'litingyes', scopes: ['repo', 'workflow', 'read:org'] })
  assert.deepEqual(writes, [{ ref: DEFAULT_CREDENTIAL_REF, value: TOKEN }])
  assert.ok(!JSON.stringify(result).includes(TOKEN), 'the token must not travel back to the browser')
})

test('a missing gh is gh_missing, a signed-out gh is gh_not_logged_in', async () => {
  const bridgeFor = exec =>
    createAuth({ getCredentials: () => credentialsDouble().service, exec, fetchImpl: okFetch() })

  await assert.rejects(
    bridgeFor(async () => {
      const error = new Error('spawn gh ENOENT')
      error.code = 'ENOENT'
      throw error
    }).importFromGh(),
    error => {
      assert.equal(error.code, 'gh_missing')
      return true
    },
  )

  await assert.rejects(
    bridgeFor(async () => {
      const error = new Error('exit 1')
      error.stderr = 'To get started with GitHub CLI, please run: gh auth login'
      throw error
    }).importFromGh(),
    error => {
      assert.equal(error.code, 'gh_not_logged_in')
      assert.match(error.message, /gh auth login/u)
      return true
    },
  )

  await assert.rejects(bridgeFor(execWith('\n   \n')).importFromGh(), error => {
    assert.equal(error.code, 'gh_not_logged_in')
    return true
  })
})

test('a rejected token never overwrites the stored one', async () => {
  const { service, writes } = credentialsDouble()
  const bridge = createAuth({
    getCredentials: () => service,
    exec: execWith(TOKEN),
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
  })
  await assert.rejects(bridge.importFromGh(), error => {
    assert.equal(error.code, 'invalid_token')
    return true
  })
  assert.equal(writes.length, 0)
})

test('a verification network failure is reported, not stored', async () => {
  const { service, writes } = credentialsDouble()
  const bridge = createAuth({
    getCredentials: () => service,
    exec: execWith(TOKEN),
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })
  await assert.rejects(bridge.importFromGh(), error => {
    assert.equal(error.code, 'network')
    return true
  })
  assert.equal(writes.length, 0)
})

test('a read-only credential store surfaces as a failure, not a silent success', async () => {
  const { service } = credentialsDouble({ setThrows: true })
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })
  await assert.rejects(bridge.importFromGh(), /read-only store/u)
})

test('the store is read per call, so a provider mounted later still counts', async () => {
  let service
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })

  assert.deepEqual(await bridge.describe(), { configured: false, writable: false, importable: false })

  service = credentialsDouble({ configured: true }).service
  assert.deepEqual(await bridge.describe(), {
    configured: true,
    source: 'stored',
    writable: true,
    importable: true,
  })
})

test('a pasted token is verified before it is stored', async () => {
  const { service, writes } = credentialsDouble()
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })
  const result = await bridge.saveToken(`  ${TOKEN}  `)

  assert.deepEqual(result, { login: 'litingyes', scopes: ['repo', 'workflow', 'read:org'] })
  assert.deepEqual(writes, [{ ref: DEFAULT_CREDENTIAL_REF, value: TOKEN }])
  assert.ok(!JSON.stringify(result).includes(TOKEN), 'the token must not travel back to the browser')
})

test('an empty or rejected pasted token is refused and nothing is written', async () => {
  const { service, writes } = credentialsDouble()
  const bridge = createAuth({ getCredentials: () => service, exec: execWith(TOKEN), fetchImpl: okFetch() })

  await assert.rejects(bridge.saveToken('   '), error => {
    assert.equal(error.code, 'bad_request')
    return true
  })

  const rejecting = createAuth({
    getCredentials: () => service,
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
  })
  await assert.rejects(rejecting.saveToken('ghp_wrong'), error => {
    assert.equal(error.code, 'invalid_token')
    return true
  })

  assert.equal(writes.length, 0)
})

test('a pasted token without a credential store is writes_disabled', async () => {
  const bridge = createAuth({ getCredentials: () => undefined, fetchImpl: okFetch() })
  await assert.rejects(bridge.saveToken(TOKEN), error => {
    assert.equal(error.code, 'writes_disabled')
    return true
  })
})
