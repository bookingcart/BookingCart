# BookingCart

BookingCart is a Vite/React application with serverless-compatible API routes and a local Express server for development parity. The database layer has been migrated to **Postgres on Nile** with schema changes managed by **Drizzle migrations**.

For the full local handoff, see [Running Locally](docs/RUNNING_LOCALLY.md).

## What changed in the migration

- Runtime code no longer creates or alters database tables.
- Schema is defined in [db/schema.js](db/schema.js).
- SQL migrations live in [db/migrations](db/migrations).
- Vercel builds run migrations before building the app.
- The migration journal is stored in `public.__drizzle_migrations__`.
- API routes connect to Nile through `DATABASE_URL`.

## Quick Start

1. Install Node 20.
2. Copy [.env.example](.env.example) to `.env`.
3. Fill in the required environment variables, especially `APP_URL`, `DATABASE_URL`, `JWT_SECRET`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `DUFFEL_API_KEY`.
4. Install dependencies:

   ```bash
   npm ci
   ```

5. Run migrations:

   ```bash
   npm run db:migrate:deploy
   ```

6. Start local development:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

The local API server runs on `http://localhost:3001` when using `npm run dev`.

## Environment

Required for normal local development:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Canonical public site origin. Use the real deployed site in production. |
| `DATABASE_URL` | Nile/Postgres connection string |
| `JWT_SECRET` | Legacy JWT auth secret for current `/api/auth/*` routes |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret |
| `BETTER_AUTH_URL` | Auth handler origin only when it differs from `APP_URL`. Use `http://localhost:3001` with `npm run dev`; set it equal to `APP_URL` for a single-process run. |
| `GOOGLE_CLIENT_ID` | Browser Google Sign-In OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret for Better Auth |
| `ADMIN_PIN` | Admin action PIN |
| `VITE_ADMIN_EMAILS` | Comma-separated admin emails |
| `DUFFEL_API_KEY` | Duffel API access |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |
| `STRIPE_SECRET_KEY` | Stripe checkout secret key |

Generate secrets with:

```bash
openssl rand -base64 32
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run local Express API on `3001` and Vite on `3000` |
| `npm start` | Serve the built app through Express |
| `npm run build` | Build the frontend with Vite |
| `npm run build:vercel` | Run deploy migrations, then build |
| `npm test` | Run unit tests |
| `npm run db:generate` | Generate Drizzle SQL migrations from `db/schema.js` |
| `npm run db:migrate` | Run Drizzle Kit migrations directly |
| `npm run db:migrate:deploy` | Run the verbose deploy migration runner |
| `npm run db:studio` | Open Drizzle Studio |

## Database Migrations

Use this workflow for schema changes:

1. Edit [db/schema.js](db/schema.js).
2. Generate migration SQL:

   ```bash
   npm run db:generate
   ```

3. Review generated SQL in [db/migrations](db/migrations).
4. Run it locally or against the target DB:

   ```bash
   npm run db:migrate:deploy
   ```

The deploy runner is intentionally verbose. It prints the migration journal status and each SQL statement before execution so Vercel failures expose the real database error.

## Vercel Deployment

[vercel.json](vercel.json) uses:

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "dist"
}
```

`npm run build:vercel` always:

1. Requires `DATABASE_URL`.
2. Runs `npm run db:migrate:deploy`.
3. Runs `npm run build`.

Set `DATABASE_URL` in every Vercel environment that builds this branch, including Preview, because migrations are forced during build.

## Authentication

- Existing `/api/auth/*` routes remain available during the Better Auth migration.
- Better Auth is mounted at `/api/better-auth/*`.
- Configure `APP_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.

## Security Notes

- Never commit `.env`.
- Use a strong `ADMIN_PIN` in shared environments.
- `GOOGLE_CLIENT_ID` is safe to expose to the browser through `/api/config`.
- `STRIPE_SECRET_KEY` must be a Stripe secret key, not a restricted key.
- Production-like runs should always use an explicit `ALLOWED_ORIGINS` allowlist.
