# Production deployment

## Release checks

Use a supported Node.js LTS release compatible with Next.js 16 (Node 22 or 24), a long-running Node process, HTTPS, and MongoDB configured as a replica set or sharded cluster. Standalone MongoDB cannot support the transactions used by checkout, receiving, restore, and backup snapshots.

1. Run `npm ci`, `npm run verify`, and `npm audit --omit=dev` in the release environment. The brand font and its license are bundled locally; builds do not fetch Google Fonts.
2. Configure the variables in `.env.example` through your secret manager. Use independent random values with at least 32 bytes for JWT and backup encryption. Run `npm run check:production`; it reports configuration problems without printing secrets.
3. Set `BACKUP_DIR` to a durable volume restricted to the application account. Keep encrypted copies off-host and securely retain the encryption key separately. Verify free space and backup age with monitoring.
4. Start with `npm start` behind a trusted HTTPS reverse proxy. The `prestart` hook rejects incomplete production configuration before launching Next.js; keep this hook in your deployment start command. Preserve the public host/origin for CSRF checks. Configure request body size limits at the proxy (allow multipart overhead for the 100 MB restore limit) and request timeouts appropriate for imports and backups.
5. On a new database only, set a temporary random `BOOTSTRAP_TOKEN`, restart, and enter it in the first-admin form. Production setup is disabled without this token. Remove the token and restart after creating the owner. Existing accounts need no setup token.

## Traffic and monitoring

The built-in login limiter is process-local. It combines a 30-attempt source limit with a five-attempt source/email limit per 15 minutes. By default it uses a shared source bucket because arbitrary client IP headers are untrusted. Set `TRUST_PROXY_HEADERS=true` only if the upstream proxy strips and overwrites incoming `X-Forwarded-For`, `CF-Connecting-IP`, and `X-Real-IP` headers and direct access to Node is blocked. Multiple processes or replicas require additional shared rate limiting at the gateway. Process restarts reset local counters.

`GET /api/health` checks HTTP liveness only; it does not prove database readiness. Monitor application errors, database availability, request latency, storage space, and backup freshness separately. API responses are marked private/no-store.

Run the automatic backup scheduler on a single long-running process. Set `BACKUP_SCHEDULER_ENABLED=false` on other processes. Manual and Settings-triggered backups remain available. Backup snapshots use a single read transaction; verify transaction duration and archive size against the real dataset. Large datasets need database-native backups in addition to application archives.

## Required staging acceptance

Use an isolated replica-set database and separate credentials. Verify owner and staff permissions, password changes and session revocation; retail, wholesale, walk-in, loose and custom-mix checkout; split payments and credit balances; inventory deductions; purchase receiving and cancellation; reports and receipt printing. Check retries/double submissions, concurrent sales for the last stock, and transaction rollback after failure.

Create and restore an encrypted archive in that isolated database, then reconcile sale, payment, stock, and accounting totals. Restore is a maintenance operation: block traffic and stop other writers before running it. Its process-local guard is not a distributed lock. No production restore or live-data mutation is part of repository verification.

Keep the previous release and its deployment configuration available for rollback. Test restore and rollback procedures before opening the store to production traffic. Passing lint, unit tests, and build does not replace this acceptance run.
