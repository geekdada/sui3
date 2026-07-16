import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { base64ToBytes, bytesToBase64 } from '#/lib/base64'
import { createId, nowSeconds } from '#/lib/crypto'
import { getDb, getSetupToken, getWebAuthnConfig } from '#/lib/env'
import { issueAccessToken } from '#/lib/session'

const CHALLENGE_TTL_SECONDS = 300
const USER_ID = new TextEncoder().encode('sui3-owner')
const USER_NAME = 'sui3'

async function storeChallenge(
  challenge: string,
  type: 'registration' | 'authentication',
) {
  const db = getDb()
  const id = createId()
  const expiresAt = nowSeconds() + CHALLENGE_TTL_SECONDS
  await db
    .prepare(
      `INSERT INTO webauthn_challenges (id, challenge, type, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, challenge, type, expiresAt)
    .run()
  return id
}

async function consumeChallenge(
  challengeId: string,
  type: 'registration' | 'authentication',
): Promise<string> {
  const db = getDb()
  const now = nowSeconds()
  const row = await db
    .prepare(
      `SELECT challenge, type, expires_at FROM webauthn_challenges WHERE id = ?`,
    )
    .bind(challengeId)
    .first<{ challenge: string; type: string; expires_at: number }>()

  await db
    .prepare(`DELETE FROM webauthn_challenges WHERE id = ?`)
    .bind(challengeId)
    .run()

  if (!row || row.type !== type || row.expires_at <= now) {
    throw new Error('Challenge expired or invalid')
  }
  return row.challenge
}

export async function isPasskeyEnrolled(): Promise<boolean> {
  const db = getDb()
  const meta = await db
    .prepare(`SELECT value FROM meta WHERE key = 'passkey_enrolled'`)
    .first<{ value: string }>()
  if (meta?.value === '1') return true
  const cred = await db
    .prepare(`SELECT id FROM passkey_credentials LIMIT 1`)
    .first()
  return Boolean(cred)
}

export async function beginRegistration(setupToken: string): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON
  challengeId: string
}> {
  if (setupToken !== getSetupToken()) {
    throw new Error('Invalid setup token')
  }
  if (await isPasskeyEnrolled()) {
    throw new Error('Passkey already enrolled')
  }

  const { rpID, rpName } = getWebAuthnConfig()
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: USER_ID,
    userName: USER_NAME,
    userDisplayName: 'SUI3',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const challengeId = await storeChallenge(options.challenge, 'registration')
  return { options, challengeId }
}

export async function finishRegistration(input: {
  setupToken: string
  challengeId: string
  response: RegistrationResponseJSON
}): Promise<void> {
  if (input.setupToken !== getSetupToken()) {
    throw new Error('Invalid setup token')
  }
  if (await isPasskeyEnrolled()) {
    throw new Error('Passkey already enrolled')
  }

  const expectedChallenge = await consumeChallenge(
    input.challengeId,
    'registration',
  )
  const { rpID, origin } = getWebAuthnConfig()

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  const { credential } = verification.registrationInfo
  const db = getDb()
  const transports = input.response.response.transports
    ? JSON.stringify(input.response.response.transports)
    : null

  await db
    .prepare(
      `INSERT INTO passkey_credentials (id, public_key, counter, transports, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      credential.id,
      bytesToBase64(credential.publicKey),
      credential.counter,
      transports,
      nowSeconds(),
    )
    .run()

  await db
    .prepare(
      `INSERT INTO meta (key, value) VALUES ('passkey_enrolled', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run()

  await issueAccessToken()
}

export async function beginAuthentication(): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON
  challengeId: string
}> {
  if (!(await isPasskeyEnrolled())) {
    throw new Error('No passkey enrolled')
  }

  const { rpID } = getWebAuthnConfig()
  const db = getDb()
  const creds = await db
    .prepare(`SELECT id, transports FROM passkey_credentials`)
    .all<{ id: string; transports: string | null }>()

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: (creds.results ?? []).map((c) => ({
      id: c.id,
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
        : undefined,
    })),
  })

  const challengeId = await storeChallenge(options.challenge, 'authentication')
  return { options, challengeId }
}

export async function finishAuthentication(input: {
  challengeId: string
  response: AuthenticationResponseJSON
}): Promise<void> {
  const expectedChallenge = await consumeChallenge(
    input.challengeId,
    'authentication',
  )
  const { rpID, origin } = getWebAuthnConfig()
  const db = getDb()

  const cred = await db
    .prepare(
      `SELECT id, public_key, counter, transports FROM passkey_credentials WHERE id = ?`,
    )
    .bind(input.response.id)
    .first<{
      id: string
      public_key: string
      counter: number
      transports: string | null
    }>()

  if (!cred) {
    throw new Error('Unknown credential')
  }

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.id,
      publicKey: Uint8Array.from(base64ToBytes(cred.public_key)),
      counter: cred.counter,
      transports: cred.transports
        ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
        : undefined,
    },
  })

  if (!verification.verified) {
    throw new Error('Authentication verification failed')
  }

  await db
    .prepare(`UPDATE passkey_credentials SET counter = ? WHERE id = ?`)
    .bind(verification.authenticationInfo.newCounter, cred.id)
    .run()

  await issueAccessToken()
}
