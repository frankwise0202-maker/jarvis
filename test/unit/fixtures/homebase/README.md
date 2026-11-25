# Jarvis Core fixtures (home base, v7.5)

Real answers of the Jarvis Core server (`core/server/` on the `core` branch) in fixture mode, captured
with `node core/server/main.mjs --fixture ok --start 2026-11-25T14:32:00 --no-persist` (TZ=UTC) and
`POST /api/fixture {"scenario": …}` for each scenario:

- `status-{ok,warn,alert,nogpu,offline}.json`: `GET /api/status` (handoff §3)
- `info.json`: `GET /api/info` (handoff §8)
- `ask.json`: `POST /api/ask {q}` per scenario and question (handoff §7)

The unit tests (`test/unit/homebase.test.mjs`) and the E2E fake Core (`test/e2e/core-fakes.mjs`) use
them as they are.
