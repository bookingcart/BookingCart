# Running BookingCart Locally

This guide covers the migrated codebase that uses **Nile/Postgres**, **Drizzle migrations**, Vite, and the local Express API server.

## Prerequisites

- Node 20
- npm
- A Nile/Postgres `DATABASE_URL`
- Google OAuth credentials
- Duffel API key for flight flows
- Stripe secret key for checkout flows

## 1. Install Dependencies

From the repository root:

```bash
npm ci
```

## 2. Create `.env`

Copy the example file:

```bash
cp .env.example .env
```

Fill in at least:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://...
JWT_SECRET=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3001
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_PIN=...
VITE_ADMIN_EMAILS=you@example.com
DUFFEL_API_KEY=...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
STRIPE_SECRET_KEY=...
```

Generate `JWT_SECRET` and `BETTER_AUTH_SECRET` values with:

```bash
openssl rand -base64 32
```

## 3. Run Database Migrations

Run the deploy migration runner:

```bash
npm run db:migrate:deploy
```

Expected output on a new database:

```text
[migrations] Ensuring journal table public.__drizzle_migrations__
[migrations] Last applied migration timestamp: none
[migrations] Applying ...
[migrations] Complete. Applied 1 migration(s).
```

Expected output after migrations already ran:

```text
[migrations] Ensuring journal table public.__drizzle_migrations__
[migrations] Last applied migration timestamp: ...
[migrations] Skipping ...; already applied
[migrations] Complete. Applied 0 migration(s).
```

## 4. Start Development

Run frontend and API together:

```bash
npm run dev
```

This starts:

- Vite frontend: `http://localhost:5173`
- Express API server: `http://localhost:3001`

Open:

```text
http://localhost:5173
```

Use `BETTER_AUTH_URL=http://localhost:3001` for this flow because Better Auth is served by the local API process.

## 5. Build Locally

For a normal frontend build:

```bash
npm run build
```

For the same build path Vercel uses:

```bash
npm run build:vercel
```

`build:vercel` requires `DATABASE_URL`, runs migrations first, then runs the Vite build.

If you run the built app locally with `npm start`, set `BETTER_AUTH_URL=http://localhost:3000` because Express serves the built frontend and API from the same process.

## 6. Run Tests

```bash
npm test
```

## Common Issues

### `DATABASE_URL is required before running migrations`

Set `DATABASE_URL` in `.env` or in the shell before running migration/build commands.

### `password authentication failed`

The database URL is present, but the Nile username/password is wrong or belongs to a different database/environment. Replace `DATABASE_URL` with the current Nile connection string.

### Vercel Preview Fails During Migration

Migrations run for every Vercel build, including Preview. Add `DATABASE_URL` to the Vercel Preview environment variables, not only Production.

### Schema Looks Missing at Runtime

Run:

```bash
npm run db:migrate:deploy
```

Runtime code verifies the migrated tables exist; it does not create tables automatically.

## Schema Change Workflow

1. Edit [../db/schema.js](../db/schema.js).
2. Generate a migration:

   ```bash
   npm run db:generate
   ```

3. Review SQL in [../db/migrations](../db/migrations).
4. Apply the migration:

   ```bash
   npm run db:migrate:deploy
   ```

5. Run tests and build:

   ```bash
   npm test
   npm run build
   ```
