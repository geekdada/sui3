import { base64ToBytes, bytesToBase64 } from '#/lib/base64'

const IV_BYTES = 12
const AAD = new TextEncoder().encode('sui3:tailscale-oauth:v1')

export type EncryptedCredential = {
  ciphertext: string
  iv: string
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array
  try {
    keyBytes = base64ToBytes(base64Key)
  } catch {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be valid base64')
  }
  if (keyBytes.byteLength !== 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to a 32-byte key')
  }
  return crypto.subtle.importKey('raw', ownedBuffer(keyBytes), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptCredential(
  plaintext: string,
  base64Key: string,
): Promise<EncryptedCredential> {
  const key = await importEncryptionKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptCredential(
  encrypted: EncryptedCredential,
  base64Key: string,
): Promise<string> {
  const key = await importEncryptionKey(base64Key)
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ownedBuffer(base64ToBytes(encrypted.iv)),
        additionalData: AAD,
      },
      key,
      ownedBuffer(base64ToBytes(encrypted.ciphertext)),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error(
      'Unable to decrypt the stored credential. Re-enter the Tailscale OAuth secret.',
    )
  }
}
