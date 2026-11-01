# CLAUDE.md

Pinochle scorekeeper: Vite + TypeScript (strict) + Preact, static site on Cloudflare Workers.

## Commands

- `npm run check`: lint, typecheck, unit tests, and build. Run it before committing.
- `npm run test:e2e`: Playwright against `dist/` via `wrangler dev`. Build first. Locally only
  Chromium is installed; CI also runs WebKit. If the installed Chromium doesn't match the
  Playwright version, set `PW_CHROMIUM_PATH` to its executable.
- Node version: see `.nvmrc`. npm only runs install scripts for packages listed under
  `allowScripts` in `package.json`.

## Conventions

- Game rules live in `src/domain/` as pure functions with unit tests. Never compute scores in the UI; call
  `scoreGame` / `scoreHand`.
- All state changes are `Action`s handled by `reduce` in `src/domain/reducer.ts`. Throw `ActionError` for
  user-facing rejections.
- Changing a persisted type in `src/domain/types.ts` requires all three:
  - update `src/storage/schema.ts`;
  - bump `SCHEMA_VERSION`;
  - add a migration in `src/storage/persist.ts`.
- No raw HTML (`dangerouslySetInnerHTML`, `innerHTML`); ESLint enforces this. No inline scripts, because the CSP blocks them.
- No new runtime dependencies without a good reason; the shipped bundle is ~21 KB gzipped.
