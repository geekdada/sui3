# SUI3

Single-user personal startpage on TanStack Start, Cloudflare Workers, and D1.

## Features

- App categories with **public** or **auth** visibility
- Free-typing fuzzy search (type anywhere; Esc clears)
- Passkey login (one credential) via deploy-time setup token
- Long-lived access cookie (sliding 90-day TTL)
- Import sui2 `data.json` (apps only; overwrite)

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

1. Open http://localhost:8333/setup and enroll your passkey
2. Open `/admin` and import your sui2 `data.json`

## Production (Cloudflare)

```bash
wrangler d1 create sui3
# put database_id into wrangler.jsonc

wrangler secret put SETUP_TOKEN
# set WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN as vars for your domain

pnpm db:migrate:remote
pnpm deploy
```

Then visit `/setup` once on the live origin.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Local dev |
| `pnpm build` | Production build |
| `pnpm deploy` | Build + Wrangler deploy |
| `pnpm db:migrate:local` | Apply D1 migrations locally |
| `pnpm db:migrate:remote` | Apply D1 migrations remotely |

See [AGENTS.md](./AGENTS.md) for architecture and auth details.
