import { describe, expect, it } from 'vitest'
import {
  decryptCredential,
  encryptCredential,
} from '#/lib/credential-crypto'

function base64Key(fill: number): string {
  const bytes = new Uint8Array(32).fill(fill)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('credential encryption', () => {
  it('round-trips a credential without storing plaintext', async () => {
    const secret = 'tskey-client-secret-case-sensitive'
    const encrypted = await encryptCredential(secret, base64Key(7))

    expect(encrypted.ciphertext).not.toContain(secret)
    expect(encrypted.iv).not.toContain(secret)
    await expect(
      decryptCredential(encrypted, base64Key(7)),
    ).resolves.toBe(secret)
  })

  it('uses a fresh IV for every encryption', async () => {
    const key = base64Key(4)
    const first = await encryptCredential('same-secret', key)
    const second = await encryptCredential('same-secret', key)

    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it('rejects malformed and incorrect encryption keys', async () => {
    await expect(encryptCredential('secret', 'bm90LTMyLWJ5dGVz')).rejects.toThrow(
      '32-byte',
    )

    const encrypted = await encryptCredential('secret', base64Key(1))
    await expect(decryptCredential(encrypted, base64Key(2))).rejects.toThrow(
      'Unable to decrypt',
    )
  })
})
