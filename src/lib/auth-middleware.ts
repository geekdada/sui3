import { createMiddleware } from '@tanstack/react-start'
import { getSession } from '#/lib/session'

export const optionalAuthMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const session = await getSession()
  return next({
    context: {
      session,
      authenticated: Boolean(session),
    },
  })
})

export const requireAuthMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return next({
    context: {
      session,
      authenticated: true as const,
    },
  })
})
