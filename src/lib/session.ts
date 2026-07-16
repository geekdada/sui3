import {
  getRequestHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { createId, nowSeconds, randomToken, sha256Hex } from '#/lib/crypto'
import { getAccessTokenTtlDays, getDb } from '#/lib/env'

const ACCESS_COOKIE = 'sui3_access'

function cookieSecureSuffix(): string {
  const host = getRequestHeader('host') ?? ''
  return !host.startsWith('localhost') && !host.startsWith('127.0.0.1')
    ? '; Secure'
    : ''
}

export function setAccessCookie(token: string, maxAgeSeconds: number) {
  setResponseHeader(
    'Set-Cookie',
    `${ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${cookieSecureSuffix()}`,
  )
}

export function clearAccessCookie() {
  setResponseHeader(
    'Set-Cookie',
    `${ACCESS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecureSuffix()}`,
  )
}

export function readAccessCookie(): string | null {
  const header = getRequestHeader('cookie')
  if (!header) return null
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq) === ACCESS_COOKIE) return part.slice(eq + 1)
  }
  return null
}

export async function issueAccessToken(): Promise<string> {
  const db = getDb()
  const id = createId()
  const secret = randomToken(32)
  const raw = `${id}.${secret}`
  const tokenHash = await sha256Hex(raw)
  const now = nowSeconds()
  const ttlDays = getAccessTokenTtlDays()
  const maxAge = ttlDays * 24 * 60 * 60
  const expiresAt = now + maxAge

  await db
    .prepare(
      `INSERT INTO access_tokens (id, token_hash, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, tokenHash, now, expiresAt, now)
    .run()

  setAccessCookie(raw, maxAge)
  return raw
}

export async function revokeAccessToken(raw: string | null) {
  if (!raw) {
    clearAccessCookie()
    return
  }
  const [id] = raw.split('.')
  if (id) {
    await getDb().prepare(`DELETE FROM access_tokens WHERE id = ?`).bind(id).run()
  }
  clearAccessCookie()
}

export type Session = {
  tokenId: string
  authenticated: true
}

export async function getSession(): Promise<Session | null> {
  const raw = readAccessCookie()
  if (!raw) return null

  const [id, secret] = raw.split('.')
  if (!id || !secret) return null

  const db = getDb()
  const row = await db
    .prepare(
      `SELECT id, token_hash, expires_at FROM access_tokens WHERE id = ?`,
    )
    .bind(id)
    .first<{ id: string; token_hash: string; expires_at: number }>()

  if (!row) return null

  const now = nowSeconds()
  if (row.expires_at <= now) {
    await db.prepare(`DELETE FROM access_tokens WHERE id = ?`).bind(id).run()
    clearAccessCookie()
    return null
  }

  const expected = await sha256Hex(raw)
  if (expected !== row.token_hash) {
    clearAccessCookie()
    return null
  }

  const ttlDays = getAccessTokenTtlDays()
  const maxAge = ttlDays * 24 * 60 * 60
  const expiresAt = now + maxAge
  await db
    .prepare(
      `UPDATE access_tokens SET last_used_at = ?, expires_at = ? WHERE id = ?`,
    )
    .bind(now, expiresAt, id)
    .run()
  setAccessCookie(raw, maxAge)

  return { tokenId: id, authenticated: true }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}
