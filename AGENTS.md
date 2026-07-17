<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Project Context

## What this is

SUI3 is a single-user personal startpage (migrated from sui2) on **TanStack Start + Cloudflare Workers + D1**.

- Apps only (no bookmarks)
- Categories with `public` or `auth` visibility
- Free-typing Fuse.js fuzzy search
- One passkey enrolled via deploy-time `SETUP_TOKEN`
- Long-lived hashed `access_tokens` in D1 + HttpOnly cookie (90-day sliding TTL)

## Scaffold / Intent

```bash
npx @tanstack/cli@latest create my-tanstack-app \
  --agent --package-manager pnpm --tailwind --framework React -y
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
```

Project renamed to SUI3 (`package.json` name `sui3`).

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TanStack Start SSR, file routes |
| Host | Cloudflare Workers (`@cloudflare/vite-plugin`, Wrangler) |
| DB | Cloudflare D1 (`DB` binding) |
| Auth | WebAuthn passkey (`@simplewebauthn/*`), one credential |
| Session | `access_tokens` table + `sui3_access` cookie |
| Search | Fuse.js (threshold 0.2, name key) |
| Font | Inter Variable |
| Package manager | pnpm |

## Architecture

- Routes: `/` startpage, `/setup`, `/login`, `/admin`
- Server: `src/lib/*.functions.ts` (`createServerFn`), D1 via `cloudflare:workers` `env.DB`
- Schema: `migrations/0001_init.sql`
- Icons: [Feather](https://github.com/feathericons/feather) for UI chrome and app tiles (sui2 MDI names are mapped where possible)

## Environment variables

Local: `.dev.vars` (gitignored). Production: Wrangler secrets/vars.

| Name | Required | Purpose |
| --- | --- | --- |
| `SETUP_TOKEN` | yes | One-time passkey enrollment secret |
| `WEBAUTHN_RP_ID` | yes | e.g. `localhost` or `sui3.example.com` |
| `WEBAUTHN_ORIGIN` | yes | e.g. `http://localhost:8333` or `https://sui3.example.com` |
| `ACCESS_TOKEN_TTL_DAYS` | no | Default `90` |
| `CREDENTIAL_ENCRYPTION_KEY` | for Tailscale | Base64-encoded 32-byte key for encrypting OAuth credentials in D1 |

## Auth flow

1. Deploy with `SETUP_TOKEN` set
2. Visit `/setup`, enter token, enroll the only passkey
3. Later visits: `/login` with passkey → issues access token cookie
4. Cookie slides TTL on authenticated requests; logout revokes DB row

## Categories & import

- Unauthenticated: only `visibility = public` categories
- Authenticated: all categories
- Admin import accepts sui2 `data.json`; **only `apps`**; overwrites all categories/apps; imported categories default to `auth`

## Scripts

```bash
pnpm dev                 # local Vite + CF bindings
pnpm db:migrate:local    # apply D1 migrations locally
pnpm db:migrate:remote   # apply on remote D1
pnpm build
pnpm deploy              # build + wrangler deploy
pnpm cf-typegen
```

## Deploy notes

1. Create D1: `wrangler d1 create sui3` and put the real `database_id` in `wrangler.jsonc`
2. Set secrets/vars (`SETUP_TOKEN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`)
   - Set `CREDENTIAL_ENCRYPTION_KEY` before configuring Tailscale in Admin
3. `pnpm db:migrate:remote`
4. `pnpm deploy`
5. Open `/setup` once

## Gotchas

- Read Worker env inside handlers via `cloudflare:workers` / per-request — not at module scope for secrets
- RP ID must match hostname used in the browser
- Only one passkey; re-enrollment blocked after `meta.passkey_enrolled`
- Do not commit personal `data.json` URLs into the repo
- Keep Intent `<!-- intent-skills -->` block intact

## Next steps for operators

1. `pnpm db:migrate:local && pnpm dev`
2. `/setup` with token from `.dev.vars`
3. Admin → import `../sui2/data.json`
4. Flip some categories to `public` if desired
