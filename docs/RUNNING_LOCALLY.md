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
APP_URL=http://localhost:3000
DATABASE_URL=postgres://...
JWT_SECRET=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3001
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_PIN=...
VITE_ADMIN_EMAILS=you@example.com
DUFFEL_API_KEY=...
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
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

- Vite frontend: `http://localhost:3000`
- Express API server: `http://localhost:3001`

Open:

```text
http://localhost:3000
```

Use `APP_URL=http://localhost:3000` and `BETTER_AUTH_URL=http://localhost:3001` for this flow because the browser lives on Vite while Better Auth is served by the local API process.

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

If you run the built app locally with `npm start`, set `BETTER_AUTH_URL=http://localhost:3000` so it matches `APP_URL` because Express serves the built frontend and API from the same process.

## 6. Run Tests

```bash
npm test
```

## Adding New Modules

A module is usually one feature area, such as support, price alerts, bookings, stays, or a new admin workflow. Keep the module small and wire it through the same layers the existing app already uses.

For a frontend-only module:

1. Add or update the page/component in [../src/pages](../src/pages) or [../src/components](../src/components).
2. Register navigation or routing in [../src/App.jsx](../src/App.jsx) if the module needs a new route.
3. Add API calls from the page only through `/api/...` endpoints.
4. Run:

   ```bash
   npm test
   npm run build
   ```

For a module with an API endpoint:

1. Create a handler in [../api-routes](../api-routes), for example `api-routes/referrals.js`.
2. Import the handler in [../server.js](../server.js).
3. Mount it with the correct limiter:

   ```js
   const referralsHandler = require('./api-routes/referrals');

   app.all('/api/referrals', apiLimiter, run(referralsHandler));
   ```

4. If the endpoint is public or browser-facing, make sure it calls `applyCors(req, res)` and handles `OPTIONS`.
5. If the endpoint reads or writes user data, require authentication with the same pattern used by `api-routes/user.js`, `api-routes/support.js`, or `api-routes/bookings.js`.
6. Add focused tests under [../test](../test) when the endpoint has auth, payment, booking, or database behavior.

For a module that needs database storage:

1. Add the table or columns to [../db/schema.js](../db/schema.js).
2. Generate a Drizzle migration.
3. Review the SQL.
4. Run the deploy migration runner locally.
5. Use the table from API code through the existing database helpers.

## Drizzle Migration Workflow

This project uses **Drizzle**, not runtime table creation. Do not create tables from API handlers. The schema belongs in [../db/schema.js](../db/schema.js), and generated SQL belongs in [../db/migrations](../db/migrations).

When adding or changing schema:

1. Edit [../db/schema.js](../db/schema.js).
2. Generate SQL:

   ```bash
   npm run db:generate
   ```

3. Open the generated SQL file in [../db/migrations](../db/migrations).
4. Confirm the SQL does exactly what you expect.
5. Apply it to the configured `DATABASE_URL`:

   ```bash
   npm run db:migrate:deploy
   ```

6. Run tests and build:

   ```bash
   npm test
   npm run build
   ```

7. Commit all related files together:

   ```text
   db/schema.js
   db/migrations/*.sql
   db/migrations/meta/*.json
   API/frontend files for the module
   tests, when added
   ```

Use `npm run db:migrate:deploy` for deployment-style runs because it prints each migration step and fails the build if the database cannot apply the migration.

## Migration Examples

### Example: Add a New Table

Add the table to [../db/schema.js](../db/schema.js):

```js
const bcReferrals = pgTable(
  "bc_referrals",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    code: text("code").notNull().unique(),
    status: text("status").default("active"),
    meta: jsonb("meta").default({}).notNull(),
    ...nullableTimestamps,
  },
  (table) => [
    index("idx_referrals_email").on(table.email),
    index("idx_referrals_code").on(table.code),
  ]
);

module.exports = {
  // existing exports...
  bcReferrals,
};
```

Then run:

```bash
npm run db:generate
npm run db:migrate:deploy
npm test
npm run build
```

### Example: Add a Column

Add the field to the existing table in [../db/schema.js](../db/schema.js):

```js
const bcSupport = pgTable(
  "bc_support",
  {
    id: serial("id").primaryKey(),
    threadId: text("thread_id").notNull().unique(),
    priority: text("priority").default("normal"),
    // existing columns...
  }
);
```

Then generate and apply:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Review the generated SQL before applying it to shared or production databases. For example, a safe generated migration might look like:

```sql
ALTER TABLE "bc_support" ADD COLUMN "priority" text DEFAULT 'normal';
```

### Example: Add an API Module Backed by a Table

Create `api-routes/referrals.js`:

```js
const { query, isDbConfigured, initDb } = require('../lib/db');
const { applyCors } = require('../lib/cors');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isDbConfigured()) {
    return res.status(503).json({ ok: false, error: 'DATABASE_URL is not configured' });
  }

  await initDb();

  if (req.method === 'GET') {
    const result = await query('SELECT * FROM bc_referrals ORDER BY created_at DESC LIMIT 50');
    return res.json({ ok: true, referrals: result.rows });
  }

  if (req.method === 'POST') {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ ok: false, error: 'Missing email or code' });

    await query(
      'INSERT INTO bc_referrals (email, code) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [String(email).toLowerCase(), String(code)]
    );

    return res.json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
```

Register it in [../server.js](../server.js):

```js
const referralsHandler = require('./api-routes/referrals');

app.all('/api/referrals', apiLimiter, run(referralsHandler));
```

Then test locally:

```bash
npm run dev
curl http://localhost:3001/api/referrals
```

## Using AI For Modules And Migrations

You can give this repository and this guide to an AI assistant and ask it to add modules, generate Drizzle migrations, run tests, and explain failures. The important part is to make the prompt explicit about the workflow and database safety.

Copy this prompt when asking an AI assistant to add a module:

```text
You are working in the BookingCart repo. This app uses Vite, Express API routes, Nile/Postgres, and Drizzle migrations.

Task:
Add a new <module name> module that does <describe behavior>.

Rules:
- Follow existing patterns in api-routes, server.js, src/pages, lib/db.js, and db/schema.js.
- If database changes are needed, edit db/schema.js and run npm run db:generate.
- Review the generated SQL in db/migrations before applying it.
- Apply migrations with npm run db:migrate:deploy.
- Do not create or alter tables from runtime API code.
- Do not commit .env, .next, dist, node_modules, or local build artifacts.
- Run npm test and npm run build before finishing.

Expected output:
- List changed files.
- Show the migration file name if one was generated.
- Explain how to run the module locally.
- Mention any env vars required.
```

Copy this prompt when asking an AI assistant only to run migrations:

```text
In the BookingCart repo, check the Drizzle migration state and apply pending migrations safely.

Steps:
1. Confirm DATABASE_URL is configured, but do not print its secret value.
2. Run npm run db:migrate:deploy.
3. If it fails, summarize the exact database error and the migration statement that failed.
4. If it succeeds, confirm how many migrations were applied.
5. Run npm test after migration.
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
