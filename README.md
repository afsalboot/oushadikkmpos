# Oushadhi POS

Production-oriented point-of-sale and inventory application built with Next.js, React, MongoDB, and Mongoose.

## Commands

```bash
npm run dev
npm run lint
npm test
npm run build
npm start
```

## Project structure

```text
src/
  app/
    (workspace)/   Authenticated pages
    api/           Route handlers grouped by resource
  components/      Page workspaces and shared client UI
    barcode/       Barcode input and camera scanning
    branding/      Oushadhi brand components
  lib/             Shared infrastructure and pure domain helpers
    server/        Server-only query helpers
  models/          Mongoose schemas and models
  services/        Business workflows and persistence
scripts/           Explicit maintenance utilities
tests/             Node test suites for domain behavior
```

Pages import their workspace component directly. API handlers authenticate and validate requests before delegating business rules to services. Reusable calculations belong in `src/lib`, while database mutations belong in `src/services`.

## Environment

Create `.env.local` with deployment-specific MongoDB and authentication settings. Environment files are ignored by Git and must never be committed.

## Database backups

Owners can create manual backups and configure scheduled backups under **Settings > Backups**. Archives use AES-256-GCM encryption. Local servers write to `backups/` by default. On Vercel (`VERCEL=1`), archives persist in the existing MongoDB database using the `oushadiBackupArchives` GridFS bucket; no server folder is used.

- Set `BACKUP_ENCRYPTION_KEY` to a dedicated archive key. New archives require this key; `JWT_SECRET` is only accepted for decrypting legacy archives.
- On a local or dedicated server, set `BACKUP_DIR` to persistent storage. Vercel ignores folder settings and uses database storage.
- Automatic scheduling requires a long-running Node.js server.
- On Vercel, due automatic backups are checked when backup status is requested; the background timer is disabled. This is not an unattended schedule while the application is idle.
- Database-stored archives consume MongoDB storage and are retained until managed outside the app. Download copies to independent storage for recovery from database loss, and retain the encryption key securely.
- The GridFS bucket is excluded from snapshots and restore replacement, so archives do not recursively include older archives and restore preserves its safety backup.

Restore accepts validated Oushadhi `.obak` archives and requires the owner confirmation phrase. A safety backup is created before transactional replacement begins.

See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration, first-owner setup, release checks, monitoring, and staging acceptance. Run `npm run check:production` to validate required production environment values without exposing secrets.
