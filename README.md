# BookingCart

Vite/React front end with serverless APIs on **Netlify** (`/api/*` → `netlify/functions/api.js`) and a local **Express** server (`server.js`) for development parity.

## Quick start (local)

1. Copy [.env.example](.env.example) to `.env` and set at least `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `DATABASE_URL`, `VITE_ADMIN_EMAILS`, `DUFFEL_API_KEY`, `ALLOWED_ORIGINS`, and `STRIPE_SECRET_KEY` where needed.
2. `npm ci`
3. `npm run db:migrate` when using a real database.
4. `npm run dev` or `npm start`
5. Open `http://localhost:3000`

## Production (Netlify)

- Set environment variables in the Netlify UI (same keys as `.env.example`).
- Use **Node 20** (see [netlify.toml](netlify.toml)).
- `ALLOWED_ORIGINS` should list your live site URL(s) for browser CORS.
- Production expects **`DATABASE_URL`** for bookings, users, support, cache, Duffel idempotency state, and Better Auth tables.
- Run **`npm run db:migrate`** before promoting code that depends on new schema changes.
- Production checkout requires **`STRIPE_SECRET_KEY`**.

## Database migrations

Database schema is managed with **Drizzle Kit**:

| Command | Description |
| ------- | ----------- |
| `npm run db:generate` | Generate SQL migrations from [db/schema.js](db/schema.js) |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:studio` | Open Drizzle Studio |

Runtime code must not create or alter tables. Add schema changes to [db/schema.js](db/schema.js), generate a migration, review the SQL in [db/migrations](db/migrations), and then apply it with `npm run db:migrate`.

## Authentication

- Existing `/api/auth/*` routes remain available while the frontend is migrated.
- Better Auth is mounted at `/api/better-auth/*` with email/password and Google provider support.
- Configure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` for Better Auth.

## Security notes

- User profile and booking lookup require a **Google ID token** (`Authorization: Bearer …`) matching the requested email.
- **ADMIN_PIN** has no default; set a strong value for admin routes.
- `GOOGLE_CLIENT_ID` is exposed to the browser via `/api/config` (normal for OAuth client IDs).

## Scripts

| Command   | Description              |
| --------- | ------------------------ |
| `npm start` | Run Express server   |
| `npm test`  | Run unit tests         |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate`  | Apply Drizzle migrations |
