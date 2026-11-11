# AGENTS.md

Guidance for coding agents (and humans) working in this repo. `CLAUDE.md` imports this file.

## What this is

A phone-first scorekeeper for 4-player partnership pinochle. It is a static single-page app:
Vite + TypeScript (strict) + Preact, deployed as a static-assets-only Cloudflare Worker at
`pinochle.theavey.com`. There is no backend. All data lives in the browser's `localStorage`, and
the app works offline through a small service worker. See `README.md` for features, scoring rules
and deployment.

## Setup and commands

Node version: see `.nvmrc` (Node 26 LTS, npm 11).

```sh
npm ci                 # install exactly what's in the lockfile
npm run dev            # dev server (no service worker in dev)
npm run check          # lint + typecheck + unit tests + build: run before every commit
npm run test:e2e       # Playwright against dist/ via `wrangler dev`; run `npm run build` first
npm run audit:prod     # known vulnerabilities in shipped dependencies (CI gate)
npm run format         # Prettier
```

Notes:

- **e2e browsers:** locally you may only have Chromium; CI also runs WebKit (iPhone). If the
  installed Chromium build doesn't match the Playwright version, set `PW_CHROMIUM_PATH` to its
  executable instead of running `playwright install`.
- **Service worker updates:** `scripts/sw-template.js` precaches the build. When a new version
  activates over an old one, it reloads open windows (`client.navigate`), because installed iOS apps
  are resumed rather than relaunched. `src/main.tsx` also calls `registration.update()` when the
  app returns to the foreground. Keep `/sw.js` as `Cache-Control: no-store` in `public/_headers`.
  `tests/e2e/update.spec.ts` simulates a deploy by rewriting `dist/sw.js`, so it runs alone, last.
- **Watch for console errors:** e2e tests serve the real `public/_headers`, so a CSP violation shows
  up as a console error and fails the tests that check for them.

## Layout

| Path           | Contents                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`  | Pure game logic: `types.ts`, `scoring.ts`, `draft.ts` (form input → hand), `reducer.ts` (all state changes), `merge.ts` (merging two copies of the data), `stats.ts`, `seats.ts`, `rules.ts`. Unit-tested. |
| `src/storage/` | `validate.ts` (validators), `schema.ts` (full-state validation), `persist.ts` (localStorage, migrations), `backup.ts` (export/import/merge). Unit-tested.                                                  |
| `src/ui/`      | `store.ts` (dispatch, undo, persistence), `router.ts` (hash routes), `screens/` (`game/TableView.tsx` is the big-score table display), `components/`, hooks (`useMediaQuery`, `useWakeLock`).              |
| `scripts/`     | `sw-plugin.ts` + `sw-template.js` (generates `dist/sw.js`), `generate-icons.mjs`.                                                                                                                          |
| `public/`      | `_headers` (CSP and other security headers, caching), manifest, icons.                                                                                                                                     |
| `tests/e2e/`   | Playwright specs and `helpers.ts`.                                                                                                                                                                         |

## Rules

**Game logic**

- Scores are always derived. Hands store raw inputs, and totals and winners come from
  `scoreGame` / `scoreHand` in `src/domain/scoring.ts`. Never compute or store scores in the UI.
- Every state change is an `Action` handled by the pure `reduce` in `src/domain/reducer.ts`.
  - Throw `ActionError` for user-facing rejections.
  - Pass time and ids in the action (`now`, `id`) so the reducer stays pure.
- New rules or scoring behavior need unit tests in `src/domain/*.test.ts` that spell out the
  cases.

**Persisted data:** changing a persisted type in `src/domain/types.ts` requires all of:

- update `src/storage/schema.ts`;
- bump `SCHEMA_VERSION`;
- add a migration step in `migrate()` in `src/storage/persist.ts`;
- test that old saved data still loads.

Never write code that could overwrite data the app failed to read.

**Merging:** `mergeStates` in `src/domain/merge.ts` combines two copies of the data (backup import,
and device sync). It must stay deterministic and order-independent: `merge(a, b)` and `merge(b, a)`
give the same games, players and tombstones, so devices converge.

- Deleting a game or player adds a tombstone in the reducer, so the deletion survives a merge.
- Changes that should win a merge must bump `updatedAt`: a game's on any change, including the draft,
  and a player's on rename.
- `merge.test.ts` checks the merge is order-independent; keep those checks when changing it.

**Security**

- No raw HTML (`dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`). ESLint enforces this.
- No inline scripts, `eval`, or third-party scripts, styles or fonts: the CSP blocks them. Keep
  everything same-origin.
- Treat `localStorage` contents and imported files as untrusted, and always go through
  `validateAppState`.

**UI**

- Mobile first: tap targets of at least 44px, and inputs at 16px or larger (otherwise iOS zooms in).
- Use the `NumberField` component for numeric entry.
- Use the `Choice` component instead of `<select>`. WebKit styles `<select>` with an internal
  stylesheet that the CSP blocks; ESLint bans it, and `tests/e2e/csp-elements.spec.ts` probes
  native elements under the real CSP.
- Support light and dark mode via the CSS variables in `src/styles.css`.

## Dependencies

- **Runtime:** don't add runtime dependencies without a strong reason. The shipped JS is about 21 KB
  gzipped, with Preact as the only runtime dependency.
- **Cooldown:** when adding or upgrading a package, use
  `npm install --min-release-age=7 <pkg>` so you only take releases at least 7 days old.
  - Exception: a security fix may take the patched version immediately.
  - Don't put `min-release-age` in `.npmrc`; it would also block urgent security fixes.
- **Dependabot:** applies a matching cooldown to version updates only. See
  `.github/dependabot.yml`, and keep its `ignore` notes current.
- **Install scripts:** npm only runs install scripts for packages listed in `allowScripts` in
  `package.json`. Approve a new one only if it truly needs a postinstall step.
- **Know the current versions:** don't assume the latest version of a package from memory; check
  with `npm view <pkg> version` (and `time`).

## Workflow

- **Deploys:** Cloudflare Workers Builds deploys `main` and uploads preview versions for other
  branches (`npx wrangler preview`, which needs the `previews` block in `wrangler.jsonc`).
  `wrangler.jsonc` runs `npm run build` itself (`build.command`). The Worker `name` must
  match the dashboard (`pinochle-score-webapp`). Node comes from `.nvmrc`, npm from `packageManager`.
- **Branches and commits:** work on a branch and open a PR into `main`. CI (lint, typecheck, unit,
  build, prod audit, e2e in Chromium and WebKit) must be green before merging. Pushing to `main`
  deploys to production through Cloudflare.
- **Keep commits focused**, with messages that say _why_.
- **Docs move with the code:** update `README.md` (user-facing) and this file (contributor-facing)
  in the same PR as any behavior, rule or tooling change.
