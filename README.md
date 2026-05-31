# BookingCart

Static HTML/JS front end with serverless APIs on **Netlify** (`/api/*` → `netlify/functions/api.js`) and a local **Express** server (`server.js`) for development parity.

## Quick start (local)

1. Copy [.env.example](.env.example) to `.env` and set at least `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `DATABASE_URL`, `VITE_ADMIN_EMAILS`, `DUFFEL_API_KEY`, `ALLOWED_ORIGINS`, and `STRIPE_SECRET_KEY` where needed.
2. `npm ci`
3. `npm run dev` or `npm start`
4. Open `http://localhost:3000`

## Production (Netlify)

- Set environment variables in the Netlify UI (same keys as `.env.example`).
- Use **Node 20** (see [netlify.toml](netlify.toml)).
- `ALLOWED_ORIGINS` should list your live site URL(s) for browser CORS.
- Production expects **`DATABASE_URL`** for bookings, users, support, cache, and Duffel idempotency state.
- Production checkout requires **`STRIPE_SECRET_KEY`**.

## Security notes

- User profile and booking lookup require a **Google ID token** (`Authorization: Bearer …`) matching the requested email.
- **ADMIN_PIN** has no default; set a strong value for admin routes.
- `GOOGLE_CLIENT_ID` is exposed to the browser via `/api/config` (normal for OAuth client IDs).

## Scripts

| Command   | Description              |
| --------- | ------------------------ |
| `npm start` | Run Express server   |
| `npm test`  | Run unit tests         |
