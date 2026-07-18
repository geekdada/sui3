#!/usr/bin/env node
/**
 * Generate an environment-specific Wrangler config from CI secrets.
 *
 * Reads:
 *   SUI3_DOMAIN_<ENV>
 *   SUI3_D1_DATABASE_ID_<ENV>
 *
 * Merges overrides into the base wrangler.jsonc and writes wrangler.<env>.jsonc.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'jsonc-parser'

const env = process.argv[2] ?? 'production'
const envSuffix = env.toUpperCase()
const domain = process.env[`SUI3_DOMAIN_${envSuffix}`]
const d1Id = process.env[`SUI3_D1_DATABASE_ID_${envSuffix}`]

if (!domain) {
  throw new Error(`Missing SUI3_DOMAIN_${envSuffix}`)
}
if (!d1Id) {
  throw new Error(`Missing SUI3_D1_DATABASE_ID_${envSuffix}`)
}

const baseName = env === 'production' ? 'sui3' : `sui3-${env}`
const baseConfig = parse(readFileSync('wrangler.jsonc', 'utf8'))

const config = {
  ...baseConfig,
  name: baseName,
  routes: [
    {
      pattern: domain,
      custom_domain: true,
    },
  ],
  d1_databases: [
    {
      binding: 'DB',
      database_name: baseName,
      database_id: d1Id,
      migrations_dir: 'migrations',
    },
  ],
}

const outputPath = `wrangler.${env}.jsonc`
writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n')
console.log(`Generated ${outputPath}`)
