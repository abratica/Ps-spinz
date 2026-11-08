# PS Spinz: daily picker

Instructions for the scheduled run that adds each day's three tracks to PS Spinz.
All paths are relative to the root of the `abratica/ps-spinz` repo (live at https://abratica.github.io/ps-spinz/).
The app (`index.html`, `js/`, `css/`, `sw.js`) only displays `data/spinz.json`. Do not change the app during a daily run.

## Who it's for

Andrew is learning to DJ at home on a Pioneer DDJ-FLX4 (rekordbox). His taste: **groove-first tech house with a darker, melodic side**, and he leans toward the darker, moodier end. Reference artists: Michael Bibi, Hot Since 82, CamelPhat, Kevin de Vries, Anyma, Cassian, Mathame, Innellea, Rafael Cerato, Dubfire. Brighter festival tracks (Fisher, Max Styler) are occasional crowd-pleasers, not the core.

The goal is not "more of the same". Pick tracks that **complement** the crate: tracks that mix well with something he kept, fill a gap (openers, closers, bridges between the groovy and dark lanes), or that the DJs he likes keep reaching for.

## The file: `data/spinz.json`

```
{ "version": 1,
  "crate":   [ { key, title, artists, spotify, lane, role, from, added, why? } ],   // what he kept
  "inbox":   [ { date, picks: [ { key, title, artists, spotify, lane, why } ] } ], // waiting for Keep / Drop
  "history": [ { key, title, artists, spotify, decision, lane, role, pickedOn, decidedOn } ] }
```

- `decision` is `keep`, `drop`, or `removed` (kept earlier, later removed from the crate).
- `lane` is `groovy` or `dark`. `role` is `opener`, `groover`, `peak`, `closer` or null.
- `key` is the artists + title in lowercase, non-alphanumerics replaced by `-`, e.g. `patrick-topping-be-sharp-say-nowt` (same rule as `tools/seed.py`).
- `spotify` is the bare Spotify track id (the part after `open.spotify.com/track/`), or null.

## Step 1: read what he thinks

Read the whole file. Learn from it:
- **Keeps** (and their lane and role tags): what to find more partners for.
- **Drops**: what to avoid. If he drops two or more tracks of the same kind (artist, sub-style, energy, vocal-heavy, etc.), steer away from it.
- **Removed**: he changed his mind; weigh like a drop.
- **Backlog**: if the inbox already holds 9 or more unreviewed picks, still add today's three (the list keeps growing by design), but make them your safest, strongest picks.

## Step 2: find candidates

Research, don't guess. Good sources, in order:
1. Recent tracklists from DJs in his lane (1001Tracklists, set79.com, mixprism.eu; search for the DJ name + "tracklist"). The best finds are:
   - **Back-to-back pairs**: a track a DJ played right before or after one already in his crate.
   - **Cross-set tracks**: a track that shows up in sets by two or more different DJs he likes.
2. Labels in his lane (e.g. Afterlife, Solid Grooves, When Stars Align, Cocoon, Hot Creations, Diynamic) and new releases from his reference artists.
3. A track he kept that has a well-known remix in the other lane can bridge groovy ↔ dark.

Rules:
- Never pick a track already in `crate`, `inbox`, or `history` (match on `key`, and also on the same title + main artist).
- No unreleased "ID - ID" tracks. It must be on Spotify.
- Mix it up: across the three, aim for at least one per lane unless his recent keeps clearly favour one, and no two picks by the same main artist.
- Prefer the **Extended / Original Mix** when Spotify has it (DJ-friendly intros and outros).

## Step 3: get the Spotify id

1. Spotify connector (`search`) with "<title> by <artist>". Take the track whose title and artists match.
2. If the connector filters it out ("licensing restrictions"), which happens a lot for Afterlife / Interscope / UMG releases (Anyma, Cassian, Kevin de Vries, CamelPhat remixes), use WebSearch with `mode: "extended"` and the query `"<title>" <artists> open.spotify.com track`. Take the id from the `open.spotify.com/track/<id>` (or `/intl-xx/track/<id>`) result whose title and artists match. Prefer the plain version over one marked "(Mixed)". The app's own Spotify lookup can't see these releases, so this step matters.
3. If you still can't confirm it, set `spotify` to null (Andrew can paste the link in the app). Don't pick more than one null per day; prefer a different track instead.

## Step 4: write today's picks

Today is the date in **America/New_York**. Append `{ "date": "<today>", "picks": [3 picks] }` to `inbox`. If an entry for today already exists, add to it until it has three, never more.

Each pick's `why` is one or two short sentences, written to Andrew, saying why it fits: which kept track it pairs with, which DJ played it next to what, or what gap it fills. Only state facts you actually read (who played it, in which set). No hype words.

Don't change `crate` or `history`, and don't remove anything from `inbox`.

## Step 5: commit

1. Validate: `python3 -m json.tool data/spinz.json > /dev/null`.
2. Commit `Picks YYYY-MM-DD` and push to `main`. If the push is rejected because Andrew saved a Keep/Drop from his phone in the meantime, `git pull --rebase`, re-apply your change to the new file if the rebase conflicts (his changes win; you only append today's inbox entry), validate again, and push.
3. Finish with a short summary: the three picks and their why.
