# Notes for agents

Static portfolio site: no build step, no dependencies, no API keys, no server code.
`index.html` holds every page and routes with hash anchors (`#home`, `#portfolio`, ...), so no SPA fallback is needed.

## Run it here
`docker compose -f docker-compose.base44.yml up -d` — one `web` service (`python:3.12-slim`) serving the repo
read-only from `/srv/site` via `python -m http.server` on host port 3000. Files are read from disk per request,
so an edit shows on the next page load; there is no watcher to restart.

## Verify
`curl -I http://localhost:3000/` should return 200, and `docker compose -f docker-compose.base44.yml ps` should show `web` healthy.

## Content
`data.js` holds projects/social/contact values; `i18n.js` holds the five translations (ar is RTL). Both are
hand-edited — there is no admin UI or database. Contact is a `mailto:`/`wa.me` handoff; nothing is stored.
