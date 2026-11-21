# Working in this repository

## What is where

- `nova/` is the NOVA AI VIDEO AGENT ULTRA app (Express API + vanilla-JS SPA, PostgreSQL).
  This is the only runnable project; run everything from it.
- The files at the repo root (`index.html`, `app.js`, `styles.css`, `media/`, `files/`) are an
  unrelated static portfolio page that predates the app. They are not served by the app and are
  not part of the compose stack.

## Running it

- `docker compose -f docker-compose.base44.yml up -d --build` — web on host port 3000, Postgres 16 as `db`.
- The `web` service bind-mounts `./nova` and runs `node --watch server/index.js`, so server edits
  restart in place. Dependencies install at container start (`npm ci` when a lockfile exists).
- `nova/Dockerfile` only installs runtime tooling (ffmpeg for rendering, Noto fonts for Arabic
  glyphs); no app source is baked in.
- The database schema is created idempotently on boot (`nova/server/db.js`, `initDb`). There are no
  separate migration or seed commands, and no test suite — `node --check <file>` is the only
  static check.

## Non-obvious behaviour

- The first account registered becomes `admin`; every later account is a normal `user`. Admin-only
  screens (`#/admin`, provider keys) are gated on that role.
- The app boots and renders without any AI provider credentials. With no verified provider the
  router falls back to the built-in local storyboard renderer (`nova/server/providers/local.js`),
  which produces a real H.264 MP4 with ffmpeg (~11 s for a 10 s clip).
- External providers (Google, Runway, Kling) stay "Not configured" until a key arrives either as
  `GEMINI_API_KEY` / `RUNWAY_API_KEY` / `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` in the environment,
  or saved from Admin → Providers (stored encrypted with `APP_SECRET`). Environment keys win.
- Signing out is not required for QA: delete the test account through the database, since there is
  no account-deletion endpoint. Every user-owned table cascades on `users.id`; `audit_log` does not.

## Verifying it works

- `curl -s http://localhost:3000/api/health` returns `{"ok":true,"db":"ok","worker":"ok",...}`.
- Client routes are hash-based (`#/director`, `#/models`, `#/creations`), not pushState paths.
- A full render can be checked end to end with the API: `POST /api/director/plan`, then
  `POST /api/projects` (a project needs at least one scene), then
  `POST /api/projects/:id/generate` and poll `GET /api/jobs/:id` for `status: succeeded` plus an
  `asset.url` served as `video/mp4`.
