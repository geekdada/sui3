import { issueAccessToken } from '#/lib/session'

/**
 * Issues a normal access-token session without a passkey ceremony.
 *
 * `import.meta.env.DEV` is replaced at build time, so the guard becomes
 * `if (!false)` in production and the bypass is unreachable there. It also
 * leaves `passkey_credentials` / `meta.passkey_enrolled` untouched, so a dev
 * login never changes enrollment state.
 */
export async function devLogin(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('Dev login is disabled')
  }
  await issueAccessToken()
}
