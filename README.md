# Pinochle Score

A phone-first scorekeeper for **4-player partnership pinochle**. It tracks the dealer, bid,
meld, trick points and running score, and keeps game history and player stats. It works
offline and installs to your home screen. Everything is stored on your device: there are no
accounts, no server and no tracking.

Planned home: **https://pinochle.theavey.com** (Cloudflare Workers, static assets only).

## Features

- **Setup:** seat 4 players on a table diagram (partners sit across), then pick or randomize the first dealer.
- **Hand entry:** pick the bidder (in bidding order from the dealer's left), then enter the bid, each team's meld, and the defending (non-bidding) team's trick points, since they usually have fewer counters to add up. The bidding team's tricks fill in automatically.
  - A live preview shows the score change, and _set_ / _meld lost_ are flagged.
  - One-tap "everyone passed, dealer stuck" and a throw-in checkbox.
  - A "took a trick with no counters" option saves meld when a team has 0 trick points.
- **Nothing gets lost:** every keystroke is saved, including a half-entered hand. Reloading, switching apps or the phone killing the browser are all fine. Reopening the app returns you to the game in progress.
- **Table display:** a big, glanceable score for everyone at the table, showing both totals, the
  current bid as it's entered ("Bob bid 30 · needs 18") and the last hand's result. Tap **Show table**
  on any device. A phone also switches to it when turned sideways; tap **Scoresheet** to enter hands
  sideways instead. An iPad shows more, and stays on the scoresheet in landscape.
- **Fix mistakes:** tap any earlier hand to edit or delete it, and every later total is recalculated. Undo is available after each save.
- **Mid-game changes:**
  - Change the target or rules.
  - Substitute or swap players. Past hands keep who actually played them.
  - Correct the dealer after a misdeal.
  - End early (the leader wins) or abandon a game.
- **History and stats:**
  - Per-player stats: win–loss, bids taken, % of bids made, average and highest bid.
  - Per-partnership win–loss records.
  - Stats follow _people_, not seats, so changing partners is fine.
- **Backup:** export to a JSON file (the phone's share sheet lets you save it to Files or Drive, or email it). Import it on another device, merging with what's already there or replacing it.
- **At the table:** an optional keep-screen-awake setting, dark mode, large tap targets, and layouts sized for both phone and iPad.

## Scoring rules

Each rule below is a setting. Every game keeps its own copy of the rules, so different groups can play different house rules.

| Setting               | Default                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Play to               | 150 (can be changed mid-game)                                                                                             |
| Minimum bid           | 25                                                                                                                        |
| Trick points per hand | 25 (A/10/K = 1 each, plus 1 for last trick)                                                                               |
| Meld needs a trick    | On: a team's meld counts only if it takes a trick                                                                         |
| Set penalty           | A bidder that falls short loses the amount bid                                                                            |
| Bidder goes out first | On: if both teams reach the target on one hand, the bidding team wins if it made its bid                                  |
| Stuck dealer          | On: if all pass, the dealer takes the bid at the minimum                                                                  |
| Throw-in              | Allowed: the bidding team loses the bid, and the defenders score their meld (alternatives: meld + all tricks, or nothing) |

How a hand is scored, where _B_ is the bidding team and _D_ is the defenders:

- **Played hand:**
  - B's points are its meld (if it counts) plus its tricks.
  - If B's points are at least the bid, B scores those points. Otherwise B scores −bid.
  - D always scores its meld (if it counts) plus its tricks.
- **Throw-in:** B scores −bid, and D scores according to the throw-in setting.
- **Winning the game:**
  - If only one team is at or above the target, that team wins.
  - If both are, and "bidder goes out" is on and B made its bid, B wins. Otherwise the higher score wins, and a tie means you play another hand.

The scoring code is in [`src/domain/scoring.ts`](src/domain/scoring.ts), and the cases are spelled out in
[`scoring.test.ts`](src/domain/scoring.test.ts).

## Using it on a phone

1. Open the site in Safari (iPhone/iPad) or Chrome (Android).
2. **Add it to the home screen.** On iOS, tap Share, then _Add to Home Screen_. This matters on
   iOS: Safari may delete a website's stored data after about 7 days of not using it, but home-screen
   apps are exempt. It also gives you a full-screen app that works offline.
3. Use **Settings → Export backup** now and then.

**Updates** install themselves. The app checks for a new version whenever you open it or switch
back to it while online, and reloads into the new version once it has downloaded (your game,
including a half-entered hand, is kept). **Settings → About** shows the version and commit
that is running.

Data lives in that one browser on that one device. The home-screen app and the Safari tab keep
_separate_ copies, and so do two different phones. Use export/import to move data between them.

## Development

Requires Node 26 (the current LTS; see [`.nvmrc`](.nvmrc)) and npm 11.

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run lint         # ESLint + Prettier check
npm run typecheck
npm run build        # -> dist/ (also generates the offline service worker)
npm run test:e2e     # Playwright against the built site served by `wrangler dev`
npm run check        # lint + typecheck + unit tests + build
```

The e2e tests serve `dist/` through `wrangler dev`, so the real Cloudflare `_headers`
(including the Content Security Policy) are applied, and any CSP violation fails the tests.
CI runs them in Chromium (phone and iPad sizes) and in WebKit (iPhone). Run `npm run build` before `npm run test:e2e`.

`scripts/generate-icons.mjs` regenerates the PNG app icons from `public/icon.svg`.

Contributor and coding-agent conventions are in [`AGENTS.md`](AGENTS.md).

### Dependencies

There is one runtime dependency (Preact); everything else is build and test tooling.

- **Cooldown:** new releases aren't adopted until they've been out for a while, which gives a
  compromised or broken release time to be caught and pulled first.
  - Dependabot waits 3 days for patch releases, 7 for minor and 14 for major (7 for GitHub Actions).
  - When adding or upgrading a package by hand, pass the same window:
    `npm install --min-release-age=7 <package>`.
- **Security fixes skip the cooldown.** Dependabot security updates ignore it. For a manual
  security fix, install the patched version directly, without `--min-release-age`. This is why the
  window isn't set in `.npmrc`: there, it would also block urgent fixes.
- **Install scripts:** npm only runs install scripts for packages approved under `allowScripts` in
  `package.json` (currently esbuild and workerd).
- **Held back on purpose:** TypeScript 7, until typescript-eslint supports it. `@types/node` majors
  move together with `.nvmrc`.

### Project layout

```
src/domain/    Pure game logic: types, scoring, draft parsing, reducer, stats (unit-tested)
src/storage/   Runtime validation, localStorage persistence, backup import/export/merge
src/ui/        Preact UI: store (dispatch/undo/persist), hash router, screens, components
public/        Icons, web manifest, Cloudflare _headers (security headers, caching)
scripts/       Build-time service-worker generator, icon generator
tests/e2e/     Playwright end-to-end tests
```

Design notes:

- **Hands store raw inputs; every score is derived.** A hand stores the bidder, bid, meld and tricks. Totals and the winner always come from replaying the hands (`scoreGame`), which is why editing an old hand or changing the rules mid-game just works.
- **All state changes go through the reducer** in `src/domain/reducer.ts`, a pure function that is easy to test. The UI store adds saving and undo on top.
- **Saved and imported data is untrusted.** `src/storage/schema.ts` validates it strictly before use, rebuilding each object from known fields only. Data that can't be read is set aside under a `pinochle:corrupt:*` key instead of being overwritten.
- **The saved format is versioned** (`schemaVersion`). Add a migration step in `src/storage/persist.ts` when the format changes.

## Deploying to Cloudflare

The app is a static-assets-only Worker (see [`wrangler.jsonc`](wrangler.jsonc)) with no server code.

**One-time setup (Cloudflare dashboard, recommended):**

1. _Workers & Pages → Create → Import a repository_, then choose `theavey/pinochle-score-webapp`.
2. Name the Worker `pinochle-score-webapp` (it must match `name` in `wrangler.jsonc`). Leave the
   defaults: the deploy command is `npx wrangler deploy`, and the production branch is `main`. No build
   command is needed, because `wrangler.jsonc` runs `npm run build` before every deploy or preview
   upload. Node and npm versions come from `.nvmrc` and `packageManager` in `package.json`.
3. After the first deploy: open the _pinochle-score-webapp_ Worker, go to _Settings → Domains & Routes_, choose _Add → Custom domain_, and enter
   `pinochle.theavey.com`. This requires the `theavey.com` DNS zone to be in the same Cloudflare
   account. Cloudflare creates the DNS record and TLS certificate.

After that, every push to `main` deploys automatically, and other branches get preview builds
(via `npx wrangler preview`; the empty `previews` block in `wrangler.jsonc` enables it)
(Cloudflare can turn these off). No Cloudflare API token is stored in GitHub.

**Manual deploy** (alternative): run `npx wrangler login` once, then `npm run deploy`.

## Security

- **Nothing to attack on a server:** no backend, database, accounts or cookies, and no third-party scripts, fonts or analytics.
- **Strict headers** in [`public/_headers`](public/_headers):
  - CSP `script-src 'self'`, with no inline scripts and no `eval`.
  - `frame-ancestors 'none'`, HSTS, `nosniff`, `no-referrer`, COOP/CORP.
  - A locked-down `Permissions-Policy`.
- **Player names are only ever rendered as text** (JSX escaping). Raw-HTML APIs are banned by lint rules, and an e2e test checks that HTML injection doesn't work.
- **Backup imports are size-capped and schema-validated** (including against `__proto__` tricks).
- **Dependencies:**
  - CI fails on known vulnerabilities in shipped dependencies (`npm run audit:prod`).
  - Dependabot proposes updates after a cooldown. Turn on _Dependabot security updates_ (repo
    Settings → Advanced Security) so security fixes skip the wait.
  - Only approved packages run install scripts. See [Dependencies](#dependencies).

## Limitations and ideas

- Only 4-player partnership play for now (no 3-handed cutthroat, and no 6- or 8-player games).
- Meld is entered per team, not per player.
- No sync between devices; backups move data instead. Syncing would need accounts and a server,
  which is deliberately left out for now.
- Possible additions: a meld calculator, "lose at −N", shooting the moon, and charts of the score over a game.
