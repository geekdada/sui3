# SUI3

Single-user personal startpage on TanStack Start, Cloudflare Workers, and D1.

## Features

- App categories with **public** or **auth** visibility
- Free-typing fuzzy search (type anywhere; Esc clears)
- Passkey login (one credential) via deploy-time setup token
- Long-lived access cookie (sliding 90-day TTL)
- Import sui2 `data.json` (apps only; overwrite)
- Private Tailscale Services section synced from a read-only OAuth client

## Local development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

Copy `.dev.vars` values as needed:

- `SETUP_TOKEN` — used once on `/setup`
- `WEBAUTHN_RP_ID=localhost`
- `WEBAUTHN_ORIGIN=http://localhost:8333`
- `CREDENTIAL_ENCRYPTION_KEY` — base64-encoded 32-byte key used to encrypt integration credentials

Generate a local encryption key with `openssl rand -base64 32`. Keep the same
value between restarts or re-enter the Tailscale credential in Admin.

1. Open http://localhost:8333/setup and enroll your passkey
2. Open `/admin` and import your sui2 `data.json`

## Production (Cloudflare)

```bash
wrangler d1 create sui3
# put database_id into wrangler.jsonc

wrangler secret put SETUP_TOKEN
wrangler secret put CREDENTIAL_ENCRYPTION_KEY
# set WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN as vars for your domain

pnpm db:migrate:remote
pnpm deploy
```

Then visit `/setup` once on the live origin.

To enable Tailscale Services, create a Tailscale OAuth client with the
read-only `all:read` scope, then enter its client ID and client secret in
Admin → Tailscale. SUI3 derives the tailnet MagicDNS suffix from internal
device FQDNs returned by the Tailscale API and refreshes it on every sync. If
discovery fails during setup, Admin reveals an optional manual DNS fallback.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Local dev |
| `pnpm build` | Production build |
| `pnpm deploy` | Build + Wrangler deploy |
| `pnpm db:migrate:local` | Apply D1 migrations locally |
| `pnpm db:migrate:remote` | Apply D1 migrations remotely |

See [AGENTS.md](./AGENTS.md) for architecture and auth details.
