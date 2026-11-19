# CLAUDE.md — tvhgo-player

Notes for Claude (and other AI assistants or people) working in this repository. Keep it current when you change how
things work. The user-facing description is in `README.md` and `docs/player.md`; this file is the "how to work here".

## What this is

A fork of [davidborzek/tvhgo](https://github.com/davidborzek/tvhgo) (a web UI and API for Tvheadend) that adds an
in-browser player and a lot around it: live TV, recordings playback, resume, a timeline guide, storage, protect/keep,
tuner warnings, ad-break skipping. It is the web front end of a larger Freeview recording stack, see the companion repo
[davewins/tvh-freeview-stack](https://github.com/davewins/tvh-freeview-stack) (Tvheadend + the `tvh-pipeline` converter + this).

- `origin` = `davewins/tvhgo-player`, `upstream` = `davidborzek/tvhgo`. Upstream code is MIT and not AI-written; keep
  the credits in `README.md` / `CREDITS.md` intact. Fork additions are AI-assisted: commits carry a `Co-Authored-By`.
- Git history is linear on top of upstream (merge-base is an upstream commit). To pick up upstream changes, rebase and
  re-run all tests.

## Layout

| Path | What |
| --- | --- |
| `main.go`, `cmd/server/server.go` | Entry point; **all wiring** (repositories → services → API) is in `server.go` |
| `api/` | chi HTTP handlers. Routes are registered in `api/api.go` (`authenticated` group needs a session/token/forward auth) |
| `core/` | Domain types and the **interfaces** every service and repository implements (`core/recording.go`, `core/playback.go`, `core/watch.go`, …) |
| `services/` | Business logic: `recording`, `kept` (wraps `recording`), `playback` (ffmpeg: on-demand MP4, live fMP4, live HLS), `storage`, `tuners`, `pipeline`, `epg`, … |
| `repository/` | DB access (sqlite3 and postgres). Migrations in `db/migration/{sqlite3,postgres}/NNN_*.sql`: **add both** |
| `tvheadend/` | Tvheadend HTTP API client and types |
| `config/` | Config structs: yaml + `env:` tags. Defaults are applied in the `Validate`/defaults functions (e.g. `config/playback.go`) |
| `ui/` | React + TypeScript + Vite, SCSS modules, vitest. `ui/src/{views,components,hooks,utils,clients/api,i18n}` |
| `docs/` | mkdocs docs. `docs/player.md` documents every fork feature: update it when you add one |
| `Dockerfile.player` | **The build used for this fork** (UI with yarn, Go build, alpine + ffmpeg). `Dockerfile` is upstream's |

## Build, test, run

Use Docker so versions match (`Dockerfile.player` uses `golang:1.26-alpine` and `node:22-alpine`).

```bash
# Go: build + tests (the repo needs Go >= 1.26)
docker run --rm -v $PWD:/src -w /src golang:1.26-alpine sh -c 'gofmt -l . ; go build ./... && go test ./...'

# UI: type-check and tests (run in ui/)
cd ui && npx tsc --noEmit && npx vitest run     # ~220 tests, ~10 s
# add a dependency (no yarn on the host; keep yarn.lock in sync):
docker run --rm -v $PWD/ui:/ui -w /ui node:22-alpine sh -c 'corepack enable && yarn add <pkg>@<exact version> --exact'

# Image
docker build -q -f Dockerfile.player -t tvhgo-player:<tag> .
```

Gotchas:
- If `ui/node_modules` was created by a Docker run it is root-owned and vitest/npm fail with `EACCES` (Vite writes
  `node_modules/.vite-temp`). Fix with `sudo chown -R $USER ui` or move the folder aside.
- UI i18n: tests mock `react-i18next`, so text assertions see **keys**, not translations. Add every new string to both
  `ui/src/i18n/locales/en/translations.json` and `de/translations.json`.
- Snapshot tests (`__snapshots__`) change when markup changes: review the diff, then `vitest run -u`.
- Playwright's Chromium cannot decode H.264, so a headless browser cannot verify actual video playback. Verify player
  *logic* with unit tests; verify layout with screenshots (override `HTMLMediaElement.duration` via an init script if
  you need a duration). Real playback must be checked by a person on a device.
- SQLite in tests: every connection to `:memory:` is its own database; use `SetMaxOpenConns(1)`. Foreign keys are
  enforced, so create real users first.

## Deploying (what this project's owner does)

The image is built locally on the server and referenced by tag in a Portainer stack (compose file kept outside this
repo); each deploy bumps the tag (`0.3.0-rebaseNN`), keeps a `...pre-rebaseNN.yml` backup of the compose file, and
updates the stack through the Portainer API (`PUT /api/stacks/<id>`, **without** `pullImage`). Verify afterwards: the
container is up, the API answers, and take a screenshot of the changed page. Commit and push after each deployed change.

## Architecture notes you will need

**Recordings and the MP4 copy.** Tvheadend records `.ts` masters. A separate pipeline (see the stack repo) writes a
browser-friendly MP4 to a "library" folder (`<recordings>/_jellyfin/...`). tvhgo plays that MP4; if none exists it can
convert on demand. The library is mounted **read-write** in tvhgo (the rest of the recordings folder read-only) because
tvhgo writes `.keep` markers and deletes kept MP4s.

**Kept recordings (`services/kept`).** "Delete, keeping the MP4" deletes the Tvheadend recording but writes
`<name>.keep` (JSON of the recording) next to the MP4. The pipeline's cleanup step skips MP4s that have a `.keep`
marker. `kept.Service` *wraps* `core.RecordingService` (embedding) and merges kept-only items into `GetAll`; the storage
service deliberately gets the *unwrapped* service. The marker format is a contract with the pipeline repo.

**Protect.** "Protected" = Tvheadend `removal = 2147483647` (Forever): Tvheadend never expires or frees it. The original
and the MP4 both stay. `removal`/`retention`: 0 = DVR profile rule, 2147483646 = maintained space, 2147483647 = forever.
Protected originals still count toward Tvheadend's used-space limit.

**Watch progress.** Table `watch_progress` (per user, per Tvheadend recording UUID). The player saves every 10 s
(`fetch` with `keepalive`, so it survives closing). Resume rules are in `ui/src/utils/progress.ts` (min 15 s, ignored
within 60 s of the end, 5 s rewind). UI store pattern: `ui/src/hooks/progress.ts`.

**Live TV (`services/playback`, `ui/src/components/player/Player.tsx`).** tvhgo takes Tvheadend's raw stream
(`profile=pass`) and transcodes with ffmpeg (x264, optional VAAPI) at the chosen height. Everything is served as **HLS**
(2 s segments, `hls_list_size` = `LIVE_TIMESHIFT_MINUTES`×30, segments in the container temp dir): Safari/iOS natively,
all other browsers through **hls.js**, which is what makes pause/rewind possible. The page POSTs
`/api/live/hls/{id}/ping` every 10 s so a long pause does not trip the 25 s idle reaper; closing the player DELETEs the
session (this frees the tuner). Browsers without HLS fall back to an endless fragmented MP4 (no real pause).
`LIVE_MAX_STREAMS` limits concurrent transcodes.

**Break bar and Skip ad break.** Ad breaks are `Commercial` chapters written into the MP4 by the pipeline.
`BreakBar` is ordinary page content under the video (native controls cannot show markers), so it is **not visible in
native fullscreen**: a known, accepted limitation (iPhone forces native fullscreen).

**Guide.** `ui/src/views/channels/guide/`. Layout is driven by CSS variables `--row` and `--left` (compact vs roomy,
remembered in localStorage; compact is the default under 700 px). The time axis is `PX_PER_MIN` px per minute in JS.

**Storage box.** Collapsible, state in localStorage (`tvhgo.storageOpen`). Amber warning at ≥60 % of the Tvheadend allowance.

## Conventions

- Match surrounding style; comments explain *why*. Go: `gofmt`. UI: prettier style as in existing files (single quotes).
- A new endpoint: handler in `api/`, route in `api/api.go`, interface method in `core/`, implementation in `services/`,
  a test next to it, and a line in the `docs/player.md` API table.
- A new setting: field with `yaml`+`env` tags in `config/`, a default in the defaults function, a row in
  `docs/configuration.md` or `docs/player.md`.
- A new table: migrations for **both** sqlite3 and postgres.
- Tests for new behaviour, always. Existing suites must stay green before you deploy.
- Never put credentials, tokens, hostnames or LAN addresses of a real installation into this public repo, its docs,
  tests or screenshots.
- Commit messages: short imperative summary, body explains why; end with the `Co-Authored-By` trailer.

## Things that have bitten before

- Reading `e.currentTarget.duration` *inside* a `setState` updater returns null (React clears the event target): read
  it into a local first.
- Tvheadend IDs are UUID strings; kept-only recordings reuse the original ID.
- Storage is cached ~30 s, so counts right after a change can look stale.
- A paused HLS player stops fetching; without the heartbeat the server would drop the session after 25 s.
- Mocks of `useManageRecordings` in tests must include every returned function (`setProtected`, …).
