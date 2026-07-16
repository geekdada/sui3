import { env as workerEnv } from 'cloudflare:workers'
import type { Env } from '#/lib/types'

export function getEnv(): Env {
  return workerEnv as unknown as Env
}

export function getDb(): D1Database {
  return getEnv().DB
}

export function getAccessTokenTtlDays(): number {
  const raw = getEnv().ACCESS_TOKEN_TTL_DAYS
  const parsed = raw ? Number.parseInt(raw, 10) : 90
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90
}

export function getWebAuthnConfig() {
  const env = getEnv()
  return {
    rpID: env.WEBAUTHN_RP_ID || 'localhost',
    origin: env.WEBAUTHN_ORIGIN || 'http://localhost:8333',
    rpName: 'SUI3',
  }
}

export function getSetupToken(): string {
  return getEnv().SETUP_TOKEN
}
