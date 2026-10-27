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
| `DUFFEL_API_KEY` | Duffel API access (flights and stays) |
| `HOTELBEDS_API_KEY` | Hotelbeds API key (stays). Leave blank to disable the provider |
| `HOTELBEDS_SECRET` | Hotelbeds shared secret used to sign requests |
| `HOTELBEDS_USE_TEST` | `true` routes Hotelbeds calls to the sandbox host |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |
| `STRIPE_SECRET_KEY` | Stripe checkout secret key |
| `CRON_SECRET` | Bearer token required by `/api/cron/*` scheduler endpoints |
| `DISABLE_IN_PROCESS_CRON` | `1` stops `server.js` from running the node-cron price tracker |

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
| `npm run build:vercel` | Run deploy migrations, then build (fails if migrations cannot run) |
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

Rules that the tests enforce:

- Handlers must not run DDL. `CREATE`/`ALTER`/`DROP TABLE` only appear in `db/migrations/*.sql`; `test/structure.test.js` fails otherwise.
- Every `.sql` file in [db/migrations](db/migrations) must have an entry in `db/migrations/meta/_journal.json`, otherwise the deploy runner never sees it.
- When you add a migration folder entry, keep timestamps increasing: the runner skips anything older than the last applied migration.
- New tables and columns must also be added to [db/schema.js](db/schema.js) and to `REQUIRED_TABLES` in [lib/db.js](lib/db.js) so a partially migrated database fails loudly instead of silently degrading.

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

1. Requires `DATABASE_URL` (override for local-only builds with `SKIP_DB_MIGRATIONS=1`).
2. Runs `npm run db:migrate:deploy` and fails the build if any migration fails.
3. Runs `npm run build`.

Set `DATABASE_URL` in every Vercel environment that builds this branch, including Preview, because migrations are forced during build.

### Scheduled jobs

Serverless functions cannot keep `node-cron` timers alive. The price tracker and the search-cache eviction are exposed as protected endpoints and scheduled by `crons` in [vercel.json](vercel.json):

| Endpoint | Task |
| --- | --- |
| `GET /api/cron/price-tracker` | Re-check active price alerts and email matches |
| `GET /api/cron/cache-eviction` | Delete expired `bc_search_cache` rows |

Both require `Authorization: Bearer $CRON_SECRET` and return `503` when `CRON_SECRET` is unset, so they fail closed. Vercel Cron sends the same header when `CRON_SECRET` exists in the project environment. On a long-running host, set `DISABLE_IN_PROCESS_CRON=1` to avoid running the tracker twice.

## Private jets and charters

Luxury aviation lives at `/aviation`. Guests can search jets, helicopters, and safari charters, request multi-leg quotes, and combine a flight with a lodge, park tickets, and ground transfer in one itinerary. Operators register at `/aviation/operators/join`; administrators review safety files at `/admin/aviation`.

Aircraft are bookable only after the operator is verified and the listing has an AOC, certification, insurance, current maintenance, and pilot certifications. Apply migration `db/migrations/0005_aviation.sql` before using a persistent database. Without `DATABASE_URL`, the API keeps operator records in memory and still serves the seeded fleet.

## Attraction ticketing

Attraction owners run timed-entry ticketing from the **Ticketing Management** area of `/attractions/dashboard` (Overview, Ticket Types & Pricing, Sales & Bookings, Inventory, QR Validation, Reports, Settings). Visitors buy on the public attraction page and collect digital tickets from **My Bookings**.

### Layers

| Layer | File |
| --- | --- |
| Domain (access, pricing, inventory, QR, refunds, notifications) | [lib/ticketing.js](lib/ticketing.js) |
| Owner/staff console API | [api-routes/attraction-ticketing.js](api-routes/attraction-ticketing.js) |
| Sales desk + QR validation API | [api-routes/attraction-ticket-sales.js](api-routes/attraction-ticket-sales.js) |
| Public availability/quote/reserve/confirm API | [api-routes/attraction-ticket-checkout.js](api-routes/attraction-ticket-checkout.js) |
| Schema | [db/migrations/0007_attraction_ticketing.sql](db/migrations/0007_attraction_ticketing.sql) |

Routes: `POST /api/attraction-ticketing`, `POST /api/attraction-ticket-sales`, `POST /api/attraction-ticket-checkout` (all `action`-based, CORS + rate limited).

### Rules that matter

- **Ownership**: `bc_attraction_profiles.owner_email` and `bc_ticket_staff` (roles `scanner` < `manager` < `owner`) gate every action through `resolveAccess`/`roleAllows`. A non-owner gets `403`; there is no wildcard fallback.
- **No overselling**: `bc_ticket_inventory` is unique per `(ticket_type_id, visit_date, slot_id)` with `slot_id = 0` as the day total. `reserveInventory` locks the row with `SELECT ... FOR UPDATE`, moves `reserved` -> `sold` only in `finalizeOrder`, and `releaseExpiredHolds` frees abandoned checkouts.
- **Server-side money**: `computeQuote` recalculates prices, promo codes, taxes and service fees from the database. Frontend totals are never trusted, and `currency` travels with every line.
- **Signed QR**: tickets carry `bct1.<ticket_no>.<HMAC>` signed with `JWT_SECRET` (namespace `::attraction-ticket`), so a scan reveals no visitor data. The server verifies the signature, attraction, payment and booking status, visit date, and remaining admissions before admitting.
- **Atomic admission**: `admit` re-reads the ticket inside a transaction, so two simultaneous scans of a single-use ticket admit exactly once; group tickets decrement `admissions_remaining` under the same lock.
- **Cancellations/refunds**: `cancelOrder`/`refundOrder` share one policy engine (`quoteRefund`) for the admin desk and customer self-service, void tickets, and return stock. Stripe refunds go through `refundCheckoutSession`; no secret key ever reaches the browser.
- **Audit**: every ticket type, inventory, staff, order and validation change is appended to `bc_ticket_audit` / `bc_ticket_validations`.

`finalizeOrder` is idempotent — retried payment callbacks reuse the existing tickets and skip the confirmation email. Tickets are only issued when the order is confirmed as paid.

### Local verification

```bash
npm run db:migrate:deploy      # applies 0007_attraction_ticketing
node scratch/test-ticketing-e2e.js
```

The rehearsal talks to the configured database, creates a throwaway attraction (`__ticketing-e2e__`), exercises settings -> types -> availability -> quote -> reservation -> oversell guard -> payment -> QR admission (partial group + concurrent duplicate scan + wrong attraction) -> ledger -> cancel -> refund -> overview/reports -> authorization, then deletes every row it created. It blanks `SMTP_HOST`/`MAILTRAP_API_TOKEN` first, so notifications print as `[MOCK EMAIL]` instead of being delivered.

Two managed-Postgres quirks are worth knowing when editing ticketing SQL: `date` columns come back as JS `Date` objects (always render them through `T.isoDate`), and the Nile proxy turns a bound empty-string parameter into `NULL`, so optional text is written as `COALESCE($n, '')` against `NOT NULL DEFAULT ''` columns.

## Maps

Every Leaflet map (stays, explore, flight tracker, attractions) renders [BasemapLayer](src/components/BasemapLayer.jsx), which draws tiles from the free, keyless providers registered in [src/lib/mapTiles.js](src/lib/mapTiles.js): OpenStreetMap, Esri World Street Map / Light Gray / Dark Gray / World Imagery, and OpenTopoMap. No map API key is required.

CARTO basemaps (`basemaps.cartocdn.com`) are deliberately not used: they now stamp "API KEY REQUIRED" over every tile unless a CARTO key is supplied.

- `BasemapLayer` switches to the next provider automatically when a tile provider starts failing (blocked, rate limited, offline).
- `BasemapSwitcher` adds the Streets/Light/Satellite pills to let visitors pick a basemap.
- To change the default, edit `DEFAULT_MAP_PROVIDER`; to add a provider, register its URL and attribution in `MAP_PROVIDERS`.
- Destination autocomplete and attraction search fall back to Wikimedia/OpenStreetMap when `GEOAPIFY_API_KEY` is not configured.

Keep each provider's attribution visible; the tiles are free but the attribution is a licence requirement.

## Location detection

The home page adapts the "Explore {country}" and "Trending hotels" sections to where the visitor actually is. No API key is required.

`GET /api/geo` resolves the caller's coarse location in this order:

1. CDN geo headers — `x-vercel-ip-country` / `x-vercel-ip-city` (Vercel) or `cf-ipcountry` / `cf-ipcity` (Cloudflare). Instant and quota-free.
2. A server-side IP lookup (`ipapi.co`, then `ipwho.is`) when no geo headers are present. Doing this on the server avoids CORS and ad-blocker failures that break browser-side lookups.
3. The browser timezone (offline-safe), applied in [src/lib/geo.js](src/lib/geo.js).

The endpoint returns only `countryCode`, `countryName`, `city`, `region`, and coordinates — never the caller's IP — and caches per IP for six hours. The client re-detects on every page load (`getGeo()` only falls back to its local cache when every detector fails), so changing network or VPN is reflected immediately instead of waiting out a cache TTL. The old 24-hour `bc_geo_data` cache is deleted on read, since a stale entry there is what pinned the section to one country.

IP geolocation is approximate, and sometimes simply wrong (carrier NAT, corporate VPN, datacenter egress). The "Kampala, Uganda · Change" pill next to the section heading lets a visitor pick their city by hand; the choice is stored in `bc_geo_override` and wins over IP detection until "Use my detected location" clears it. `/api/stays-locations?q=` supplies the suggestions and now returns each city's `countryCode` so the section can rebuild country-specific content.

- Cities per country live in `EXPLORE_CITIES_BY_COUNTRY` in [HomePage.jsx](src/pages/HomePage.jsx).
- Countries without a curated list use their detected (or picked) city first, then `REGION_HUB_CITIES` for their region.
- Other components should call `getGeo()` from `src/lib/geo.js` rather than hitting a geo API directly; a structure test enforces this.

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
- `GET /api/bookings?ref=...` returns a redacted booking (itinerary, status, total) to callers who are not the booking owner or an administrator. Pass `Authorization: Bearer <token>` to receive passenger, contact, payment and ticket details.
- Auth rate limits are stored in `bc_rate_limits`, so brute-force protection survives serverless cold starts. The limiter falls back to in-memory counters only when Postgres is unreachable.
