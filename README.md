# CampusFlow · Student Placement Management System

CampusFlow is a React + Vite frontend and Express + MySQL backend for a college placement cell. It manages students, hiring partners, job drives, applications, and real database-backed placement analytics.

## What is included

- Responsive enterprise-style placement workspace with Overview, Students, Companies, Jobs & Drives, Applications, and Reports.
- Light/dark mode with a persisted `localStorage` preference and operating-system fallback. The preference is applied in `index.html` before the app loads to avoid a dark-mode flash.
- Real login, logout, session restoration, and session expiry handling using server-managed opaque cookies.
- `admin` and `coordinator` write access; `viewer` read-only access. Authorization is enforced by Express middleware, not only by hidden React buttons.
- Bcrypt password hashes, generic login errors, login rate limiting, parameterized SQL, narrowly configured CORS, and no credentials in frontend code.
- Request timeouts, strict calendar-date validation, stale dashboard/report refresh protection, last-administrator safeguards, transactional role changes, and periodic cleanup of expired auth artifacts.
- Additive, repeatable migrations that preserve the existing placement tables and records.
- Dashboard statistics using real database aggregates, recent application activity, reports, and 45-second visible-tab polling. Successful writes emit a shared data-change event so the Overview refreshes without a manual browser reload.
- Backend compatibility adapters for the existing snake_case API contract and the frontend camelCase form model.

## Requirements

- Node.js 18+ (Node 20+ recommended)
- MySQL 8-compatible database
- A database user with permission to create the additive auth and migration tables

## Configuration

Copy `.env.example` to `.env` only if you need to create a new local configuration. The current `.env` is intentionally ignored by Git; do not overwrite it without checking its database purpose first.

Backend values belong in `.env`:

```env
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=placement_management
DB_PORT=3306
PORT=5000
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SESSION_TTL_HOURS=8
REMEMBER_ME_DAYS=30
COOKIE_SAME_SITE=lax
NODE_ENV=development
```

The browser only needs the public API origin. Vite reads it from `VITE_API_BASE_URL`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Never put `DB_PASSWORD`, session secrets, password hashes, or other server-only secrets in a Vite environment variable. The session token is stored in an `HttpOnly` cookie and is never placed in `localStorage`.

## Install and migrate

```bash
npm install
npm run migrate
```

The migration runner:

1. Creates `schema_migrations` if needed.
2. Applies `000_baseline.sql` using non-destructive `CREATE TABLE IF NOT EXISTS` statements. It does not reset, drop, or truncate the existing `students`, `companies`, `jobs`, or `applications` tables.
3. Applies `001_auth_sessions_and_audit.sql`, which adds roles, users, user roles, sessions, reset-token storage, and application status history.
4. Stores a SHA-256 checksum and refuses to silently run a changed migration version.
5. Uses a MySQL advisory lock to prevent concurrent migration runs.

Run `npm run migrate` again to verify that the schema is already current. A database backup is still recommended before any schema change in a shared or production environment.

## Create the first administrator

After migrating, run the controlled interactive bootstrap command:

```bash
npm run bootstrap-admin
```

Enter a full name, email, and password of at least 12 characters when prompted. The password is bcrypt-hashed before it is inserted. The script refuses to overwrite an existing account and does not create a default administrator password. It does not send email; password-recovery delivery is intentionally not claimed until an email provider is configured.

## Run both applications

Use separate terminals from the project directory:

```bash
# Terminal 1 — API server
npm run server

# Terminal 2 — Vite frontend
npm run dev
```

Open `http://localhost:5173`, then sign in with the provisioned administrator or another provisioned account. The Express API listens on `http://localhost:5000` by default.

For a single-server preview after building:

```bash
npm run build
# set SERVE_FRONTEND=true in the backend environment, then:
npm run server
```

Express serves `dist/` and falls back to `index.html` for non-API routes when `SERVE_FRONTEND=true`.

## API surface

The existing placement routes remain at `/api` and are now authenticated. The API utility in `src/api.js` is the only frontend request boundary.

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Public, rate limited |
| `GET` | `/api/auth/me` | Authenticated |
| `POST` | `/api/auth/logout` | Public/session-aware |
| `POST` | `/api/auth/password-reset/request` | Public, generic response and rate limited |
| `POST` | `/api/auth/password-reset/confirm` | Public, rate limited, single-use token |
| `GET` | `/api/users` | Admin |
| `POST` | `/api/users` | Admin |
| `PATCH` | `/api/users/:id/role` | Admin |
| `PATCH` | `/api/users/:id/status` | Admin |
| `GET` | `/api/health` | Public database health check |
| `GET` | `/api/dashboard/stats` | Authenticated |
| `GET` | `/api/students` | Authenticated |
| `POST` | `/api/students` | Admin/coordinator |
| `PUT` | `/api/students/:id` | Admin/coordinator |
| `GET` | `/api/companies` | Authenticated |
| `POST` | `/api/companies` | Admin/coordinator |
| `GET` | `/api/jobs` | Authenticated |
| `POST` | `/api/jobs` | Admin/coordinator |
| `GET` | `/api/applications` | Authenticated |
| `POST` | `/api/applications` | Admin/coordinator |
| `PATCH` | `/api/applications/:id/status` | Admin/coordinator |

Application statuses are `Applied`, `Shortlisted`, `Rejected`, and `Selected`. The API accepts the frontend's lowercase aliases at the boundary, while new applications always start as `Applied` and the server performs CGPA and duplicate-application checks.

## Testing and checks

```bash
npm run migrate       # database migration and idempotency check
npm run build         # production frontend build
npm test              # build plus backend smoke tests
```

The smoke tests verify the API root and that placement data cannot be read without a session. In the available environment, the backend was also started, MySQL health was checked, a temporary authenticated admin exercised login, session restoration, dashboard access, CRUD/status update flow, and a temporary viewer was rejected from a write route. Temporary verification records were removed afterward; existing placement records were not reset.

The current automated suite is intentionally small and safe to run without mutating the configured placement database. It does not replace a dedicated staging-database integration suite for login, role transitions, reporting aggregates, and browser accessibility.

The browser UI should additionally be checked manually after `npm run dev`: login/logout, session restoration after refresh, the theme toggle across routes, Viewer read-only behavior, responsive navigation, API error states, and direct route refreshes.

## Security notes and current limits

- `Secure` is enabled for cookies when `NODE_ENV=production`; use HTTPS in production.
- CORS defaults to the two local Vite origins and can be narrowed with `FRONTEND_ORIGINS`.
- Sessions are server-side rows with hashed opaque tokens, expiry, revocation, and last-seen timestamps.
- Reset-token storage plus request/confirm endpoints are included. The server stores only token hashes, expires tokens after 30 minutes, marks them single-use, and revokes sessions after a password change. A mail adapter still must be wired to deliver the raw token; until then the login page explains that recovery delivery is not configured instead of pretending an email was sent.
- The project has no public registration flow. Account creation is controlled by an administrator/bootstrap procedure.
- `node_modules/`, `dist/`, and `.env` are excluded from Git. Use `.env.example` as the redacted configuration template.

## GitHub upload

From the project directory:

```bash
git init
git add .
git commit -m "feat: complete placement management platform"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```
