import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuthMiddleware } from '#/lib/auth-middleware'
import {
  beginAuthentication,
  beginRegistration,
  finishAuthentication,
  finishRegistration,
  isPasskeyEnrolled,
} from '#/lib/passkey'
import {
  getSession,
  readAccessCookie,
  revokeAccessToken,
} from '#/lib/session'

export const getAuthStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()
    const enrolled = await isPasskeyEnrolled()
    return {
      authenticated: Boolean(session),
      enrolled,
    }
  },
)

export const beginSetupFn = createServerFn({ method: 'POST' })
  .validator(z.object({ setupToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    return beginRegistration(data.setupToken)
  })

export const finishSetupFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      setupToken: z.string().min(1),
      challengeId: z.string().min(1),
      response: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    await finishRegistration({
      setupToken: data.setupToken,
      challengeId: data.challengeId,
      response: data.response,
    })
    return { ok: true }
  })

export const beginLoginFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    return beginAuthentication()
  },
)

export const finishLoginFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      challengeId: z.string().min(1),
      response: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    await finishAuthentication({
      challengeId: data.challengeId,
      response: data.response,
    })
    return { ok: true }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  await revokeAccessToken(readAccessCookie())
  return { ok: true }
})

export const requireAuth = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    return { ok: true }
  })
