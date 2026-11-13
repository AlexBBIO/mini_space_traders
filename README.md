# Orbit Lanes

A small browser game about running freight in one corner of a slowly turning galaxy. You draw routes between worlds; the freighters fly them on their own. The aim is to keep every world's orders filled as the network grows.

There are two ways to play. **Today's galaxy** is the same for everyone on a given day (it changes at midnight UTC) and has its own leaderboard. **Random galaxy** deals a new one every run.

Everything is one HTML file with no dependencies beyond a Google Fonts stylesheet. Graphics are drawn on a canvas and all sound is synthesised in the browser.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Put it online with Vercel

The repository deploys as it is: `index.html` is a static page and `api/scores.js` is a serverless function. There is no build step.

1. At [vercel.com/new](https://vercel.com/new), import this repository. Leave the framework preset on "Other" and the build settings empty, then deploy.
2. For the leaderboard, open the project's **Storage** tab, create an **Upstash for Redis** database (the free plan is enough) and connect it to the project, with the **Production** environment ticked.
3. Redeploy (**Deployments**, the newest one's menu, **Redeploy**). The database's variables only reach deployments made after it was connected, so this step is not optional.

Every push to `main` redeploys. Until steps 2 and 3 are done the game works and the end screen says the leaderboard is not set up.

To check, open `/api/scores?debug=1` on the site. `configured` should be `true`. If it is not, `help` says what is missing and `relatedVariableNames` lists the storage variables the deployment can see (names only, never values). The leaderboard needs the pair ending in `REST_API_URL` and `REST_API_TOKEN` that Upstash for Redis provides; a Vercel access token, a Postgres or Blob store, or a plain `REDIS_URL` will not do.

## Leaderboard

After a run collapses, the player can enter a name and post the run. On the hosted site this uses the scores API below; opened as a Claude artifact it uses the artifact's own database; opened from disk it is hidden. A board ranks runs by units delivered and shows the top ten, with the top five on the start screen.

There is a board for each day's galaxy and one for all time. A run of today's galaxy goes on both and is ranked on today's; a run of a random galaxy goes on the all-time board only. The start screen shows today's board once anyone is on it.

- `api/scores.js` stores scores in a Redis sorted set through the Upstash REST API. It reads `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or any pair of variables ending in `REST_API_URL` / `REST_URL` and `REST_API_TOKEN` / `REST_TOKEN`, so a custom prefix chosen when connecting the database works too.
- `GET /api/scores?day=YYYY-MM-DD` answers `{ top, day, daily }`: the all-time board and that day's (today's if no day is given). A day's board is kept for 30 days. A posted run may name the server's day or the day either side of it, since the player's clock decides which galaxy they were dealt.
- If the board says it is not set up, open `/api/scores?debug=1` on the site (see above).
- Names are cut to 16 characters and stripped of angle brackets and control characters. There is no profanity filter.
- One address can post six scores a minute. The board keeps the best 500 runs.
- Scores are reported by the player's browser. The API rejects impossible ones, but a determined person can still post a fake score.

## How it works

- **Everything is counted in units you can see.** A world's level (1 to 3) is how many units of its good it makes: it is drawn that size, with that many shapes on it. Each shape in a world's BUYS tag is one unit it wants. One unit made covers one unit wanted, so supply and demand can be balanced by counting shapes.
- **The network keeps two units spare.** A world joins at level 1 and arrives buying one unit of something the network has spare. Midway between arrivals an existing world grows a level: it makes one more unit and wants one more. Nothing a world already buys is ever taken away.
- **Sometimes demand runs ahead.** A growing world may want the good the next newcomer will sell before that world has joined, leaving that good one unit short until it arrives. The message says so, and the map shows what the next world sells.
- **Production is just in time.** A world only releases a unit when an order it can reach by its own routes is waiting, so stock builds up only where deliveries fall behind. A world with nothing it can reach still keeps up to three units on show while orders for its good wait somewhere, so an untapped seller is visible.
- **The route panel shows a route running.** For each good it carries: what its buyers want and what it delivered over the last minute, any seller asked for more than it makes, and every freighter with its load and heading.
- **Freighters** load one unit per open order ahead of them, never two for the same order, and wait at a world when there is nothing to carry. They accelerate to the midpoint of a lane, flip, and brake.
- **Depots** can be built on a world so one route can leave goods there for another route to carry on. A depot keeps a couple of units ahead of demand for each good it passes on.
- **Events** (demand surges and supply crunches) knock a balanced network off for a while.
- **The galaxy** exists in full from the start. Most worlds are dormant; the one nearest your network wakes next. It rotates very slowly, the inner parts a little faster.
- **You lose** when six or more open orders sit at one world for a minute. The map dims, shock rings roll out from that world and the view closes in on it before the summary appears.
- **The day's galaxy is dealt from the date.** The map, what every world sells and buys, the order worlds join and grow in, and the events all come from a seed, and the timetable is worked through on whole seconds, so it unfolds the same on any browser at any frame rate, whatever the player does. Only the split-second jitter in when individual orders appear differs between players.

## Files

| File | What it is |
| --- | --- |
| `game.html` | The source: title, styles, markup and script, without the outer `<html>` wrapper. |
| `index.html` | The playable page, built from `game.html`. |
| `build.js` | Rebuilds `index.html` after editing `game.html`. |
| `api/scores.js` | The leaderboard endpoint, run by Vercel as a serverless function. |
| `api/runs.js` | The run-log endpoint. |
| `tests/` | Playwright scripts used while developing. |

After changing `game.html`:

```bash
node build.js
```

## Tests

The scripts in `tests/` need [Playwright](https://playwright.dev) (`npm i playwright`) and are run one at a time with `node`:

| Script | What it checks |
| --- | --- |
| `tests/bot.js` | A crude bot plays several fast-forwarded runs and reports how long it survives. Also tests a relay through two depots. |
| `tests/stress.js` | Random routes, removals and depots for 15 minutes, checking the order bookkeeping stays consistent. |
| `tests/balance.js` | Runs the unit ledger unplayed and checks its rules: two units spare, never more than one short, newcomers arrive buying, nothing is taken away. |
| `tests/ui.js` | Real mouse input: drawing a route, zooming, panning. |
| `tests/audio.js` | Plays in real time with sound on and checks for errors. |
| `tests/logging.js` | Plays a run to collapse and inspects the saved run record. |
| `tests/depot.js` | A depot world as a hub: one route in, another out to a buyer the first route never visits. |
| `tests/leaderboard.js` | Checks the scores API rules against a stand-in store, including the daily boards, then posts scores through the game's own form. |
| `tests/shape.js` | Measures how clustered the network is as it grows (1 = a round blob, 3 or more = a line). |
| `tests/stops.js` | Takes worlds off a route with a right-click and with the route panel's buttons. |
| `tests/daily.js` | Plays today's galaxy at different frame rates, unplayed and played, and checks the map, goods, growth and events are identical; another day and a random galaxy must differ. |
| `tests/runs.js` | Checks the run-log API against a stand-in store, then plays a run that saves to it and copies its record. |

The bot is a floor for difficulty, not a measure of how the game feels.

## Run logging

The game keeps a record of each run: pacing snapshots, purchases, events, each good's supply, demand and missing links, and what the collapsing world was short of. It holds nothing about the player.

- Opened as a Claude artifact, the record is saved to that artifact's own database.
- Hosted on Vercel, it is posted to `api/runs.js`, which keeps the last 60 runs for 30 days in the same Upstash database as the leaderboard. `GET /api/runs` lists them, `GET /api/runs?latest=1` returns the newest in full, and `GET /api/runs?id=...` returns one. Without a database nothing is kept.
- Anywhere, **Copy run log** on the end screen copies the record as text.
