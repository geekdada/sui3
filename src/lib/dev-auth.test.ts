import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issueAccessToken: vi.fn(),
}))

// session.ts reaches #/lib/env -> cloudflare:workers, which does not resolve
// under the node test environment.
vi.mock('#/lib/session', () => ({
  issueAccessToken: mocks.issueAccessToken,
}))

import { devLogin } from '#/lib/dev-auth'

describe('devLogin', () => {
  beforeEach(() => {
    mocks.issueAccessToken.mockReset()
    mocks.issueAccessToken.mockResolvedValue('token-id.secret')
  })

  it('issues an access token when running in dev/test', async () => {
    await devLogin()

    expect(mocks.issueAccessToken).toHaveBeenCalledTimes(1)
  })

  it('propagates a failure to issue the token', async () => {
    mocks.issueAccessToken.mockRejectedValue(new Error('D1 unavailable'))

    await expect(devLogin()).rejects.toThrow('D1 unavailable')
  })
})
