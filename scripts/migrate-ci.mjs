// Workers Builds runs the build command and then deploys — it never calls
// `npm run deploy`, so the migration step in that script never happens in CI.
// Twice now a deploy has shipped code against a table that lacked its column.
// Hooking migrations onto the build puts them back in front of the deploy.
//
// Deliberately non-fatal: a build that can't migrate should still ship, because
// failing the build would take the whole site down over a schema change. The
// loud log is the signal to go look.
import { execFileSync } from 'node:child_process'

// Only in Cloudflare's builder — a local `npm run build` must not touch prod.
const inWorkersCI = Boolean(process.env.WORKERS_CI || process.env.WORKERS_CI_BUILD_UUID)

if (!inWorkersCI) {
  console.log('[migrate-ci] not in Workers Builds, skipping remote migrations')
  process.exit(0)
}

try {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'migrations', 'apply', 'meal-planner-db', '--remote'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  console.log('[migrate-ci] migrations applied\n' + out)
} catch (err) {
  console.error(
    '[migrate-ci] MIGRATIONS DID NOT APPLY — deploying anyway.\n' +
      'The next release may hit a missing column. Apply them by hand:\n' +
      '  npx wrangler d1 migrations apply meal-planner-db --remote\n',
  )
  console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message))
}
