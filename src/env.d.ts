/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
  export const env: {
    DB: D1Database
    SETUP_TOKEN: string
    WEBAUTHN_RP_ID: string
    WEBAUTHN_ORIGIN: string
    ACCESS_TOKEN_TTL_DAYS?: string
    CREDENTIAL_ENCRYPTION_KEY?: string
  }
}
