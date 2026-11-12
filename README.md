# Orbit Lanes

A small browser game about running freight in one corner of a slowly turning galaxy. You draw routes between worlds; the freighters fly them on their own. The aim is to keep every world's orders filled as the network grows.

Everything is one HTML file with no dependencies beyond a Google Fonts stylesheet. Graphics are drawn on a canvas and all sound is synthesised in the browser.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## How it works

- **Worlds** each make one good and buy one to three others. Bigger worlds make more and order more.
- **Supply and demand are fixed rates.** When a world joins, demand worth 92% of its output is added for its good and handed out to worlds that do not sell it.
- **Production is just in time.** A world only releases a unit when an order it can reach by its own routes is waiting, so stock builds up only where deliveries fall behind.
- **Freighters** load one unit per open order ahead of them, never two for the same order, and wait at a world when there is nothing to carry. They accelerate to the midpoint of a lane, flip, and brake.
- **Depots** can be built on a world so one route can leave goods there for another route to carry on.
- **Events** (demand surges and supply crunches) knock a balanced network off for a while.
- **The galaxy** exists in full from the start. Most worlds are dormant; the one nearest your network wakes next. It rotates very slowly, the inner parts a little faster.
- **You lose** when six or more open orders sit at one world for a minute.

## Files

| File | What it is |
| --- | --- |
| `game.html` | The source: title, styles, markup and script, without the outer `<html>` wrapper. |
| `index.html` | The playable page, built from `game.html`. |
| `build.js` | Rebuilds `index.html` after editing `game.html`. |
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
| `tests/balance.js` | Runs the economy unplayed and prints supply against demand for each good. |
| `tests/ui.js` | Real mouse input: drawing a route, zooming, panning. |
| `tests/audio.js` | Plays in real time with sound on and checks for errors. |
| `tests/logging.js` | Plays a run to collapse and inspects the saved run record. |

The bot is a floor for difficulty, not a measure of how the game feels.

## Run logging

When the game is opened as a Claude artifact it saves a record of each run (pacing snapshots, purchases, events and what the collapsing world was short of) to that artifact's own database. Opened anywhere else, including from this repository, nothing is logged.
