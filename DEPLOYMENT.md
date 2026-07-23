# Dual-platform deployment

Atlas Marketing Studio uses one business codebase with platform-specific
database and media adapters selected before each build.

| Target | Database | Media storage | Selection |
|---|---|---|---|
| Cloudflare | D1 through `@prisma/adapter-d1` | R2 binding `MEDIA_BUCKET` | `npm run cf:*` forces `DEPLOY_TARGET=cloudflare` |
| Vercel | Neon Postgres through `@prisma/adapter-neon` | Public Vercel Blob | Vercel injects `VERCEL=1` |

`scripts/generate-prisma-clients.mjs` keeps `prisma/schema.prisma` as the
canonical model and generates both a D1 client and a PostgreSQL/Neon client.
`scripts/prepare-platform.mjs` then creates the platform entry modules consumed
by the application.

## Cloudflare Workers: D1 and R2

The checked-in `wrangler.jsonc` points at the hosted demo resources. For a fork,
create your own resources:

```bash
npx wrangler login
npx wrangler d1 create atlas-marketing-studio
npx wrangler r2 bucket create atlas-marketing-studio-media
```

Copy the returned D1 `database_id` and both resource names into
`wrangler.jsonc`, keeping the binding names exactly:

- D1: `DB`
- R2: `MEDIA_BUCKET`

Generate the initial SQLite/D1 schema and apply it to the remote database:

```bash
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output /tmp/atlas-marketing-studio-init.sql

npx wrangler d1 execute atlas-marketing-studio \
  --remote \
  --file=/tmp/atlas-marketing-studio-init.sql \
  -y
```

Configure application secrets:

```bash
npx wrangler secret put ATLASCLOUD_API_KEY
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put NEXTAUTH_URL
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Add Stripe or Atlas redeem-provider secrets if that payment path is enabled,
then build and deploy:

```bash
npm run cf:build
npm run cf:deploy
```

The storage capability endpoint should report:

```json
{"provider":"r2","configured":true,"directUpload":false}
```

## Vercel: Neon and Public Blob

1. Import the GitHub repository into Vercel.
2. Create or connect a Neon Postgres database.
3. Create a **Public** Vercel Blob store and connect it to the project.
4. Configure application/auth/payment variables from `.env.example`.
5. Set `CLOUDFLARE_MEDIA_BASE_URL` when existing database rows still contain
   `/api/marketing-studio/media/<key>` R2 paths.

Required runtime variables:

```env
DATABASE_URL="postgresql://...pooler.../db?sslmode=require"
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
ATLASCLOUD_API_KEY="..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://your-project.vercel.app"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Initialize an empty Neon database once from a trusted environment:

```bash
DEPLOY_TARGET=vercel npm run db:push:vercel
```

Vercel's Build Command is:

```bash
npm run build
```

The storage capability endpoint should report:

```json
{"provider":"vercel-blob","configured":true,"directUpload":true}
```

Reference videos and completed reels use browser-to-Blob multipart uploads, so
large media bodies do not pass through a Vercel Function. New Blob URLs are
stored directly in creation records.

## Existing R2 media on Vercel

Vercel does not automatically copy D1 records or R2 objects. During a staged
migration, configure:

```env
CLOUDFLARE_MEDIA_BASE_URL="https://your-worker.workers.dev"
```

The legacy media route redirects old R2 paths to the Cloudflare deployment, and
server-side image analysis can read those assets through that base URL. Remove
the variable only after old objects and database URLs have been migrated.

## Verification

Run both builds before publishing:

```bash
npx tsc --noEmit
DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/db" \
  BLOB_READ_WRITE_TOKEN="vercel_blob_rw_build_only" \
  npm run build:vercel
npm run cf:build
```

The placeholder variables above are only for build-time module validation; they
do not connect to a database or Blob store.

After deployment, verify:

- `/`, `/marketing-studio`, `/ad-reference`, and `/drama-studio` return `200`.
- `/api/media-storage/capabilities` reports the expected provider.
- unauthenticated upload/save requests return `401`.
- Cloudflare R2 media supports `Range` requests (`206`).
- Vercel direct upload succeeds for an authenticated user.

## Data migration boundary

- D1 users, credits, sessions, and creation history are not copied to Neon.
- R2 media is not copied to Vercel Blob.
- SQLite/D1 SQL cannot be applied to PostgreSQL.

For a production migration, use a maintenance window and separately validate
row counts, relationships, credit-ledger balances, object counts, and media URL
rewrites.
