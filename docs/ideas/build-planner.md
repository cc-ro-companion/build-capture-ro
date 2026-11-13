# Build planner

Updated: 2026-11-13

## Core idea
A public, Path of Building inspired build planner for the ccRO community. In
the desktop browser, users plan a character (stats, gear, runes, card album,
skills, buffs, consumables), pick a target monster with its debuffs, and see
damage dealt (incl. ASPD, cast time, DPS) and damage taken. Builds are shared
as codes, with no login and no backend. Based on rAthena pre-renewal data and
logic, extended with ccRO features. Developed as a real product from the
start, open source under GPL-3.0.

## Audience and scope
- Audience: the ccRO community only; the tool is tailored to ccRO, with no
  plans for other servers.
- Own new repo, beside ccro-companion (created once this document is done).
- No prototypes or proofs of concept; a real product from the start.
- Jobs: pre-renewal, no rebirth jobs. Expanded classes are in: Taekwon, Star
  Gladiator, Soul Linker, Ninja, Gunslinger, Super Novice. ccRO specialities
  are handled separately.
- Desktop browser first. Mobile is not a goal; revisited only if people
  complain.
- English only, but the data is modelled with translation in mind.
- Feedback reaches the maintainer in the community; no feedback channel in
  the app.

## Platform and hosting
- No login, no backend; everything runs in the frontend.
- Hosted on GitHub Pages.
- Runs in the browser; optionally downloadable as an installable PWA.
- A service worker precaches all assets on the first start; later starts are
  fast and the app works offline.

## Data and game logic
- Base: rAthena pre-renewal data and logic; ccRO features on top.
- Build data is mostly ids; the game data lives in the app.
- Ids never change (not on ccRO, not on other RO servers).
- A lot of data is needed, e.g. monster skill data for damage taken.
- Item, card, combo, buff and skill effects come as rAthena scripts and must
  be turned into effects the formulas can use. Seen as a challenge (likely the
  biggest piece of work); approach figured out during development.

## Sprites and assets
- Monster sprites, item sprites, skill icons, etc.
- Extracted from the client once by the maintainer; ratemyserver as a
  fallback for anything missing. Bundled into the app, never hotlinked.
- Stored outside the app repo and pulled in at build time (e.g. by the
  GitHub Actions workflow that deploys to Pages); the store itself is chosen
  during implementation.

## Build contents
- Level, job level, stats; job stat bonuses; stat point budget.
- Items with refinement; runes (ccRO's cards).
- ccRO card album with its collection bonuses.
- Skills, with skill point budget and prerequisites.
- Buffs: own and from other players, ticked in a buffs section.
- Cooking and other consumables: ASPD potions, elemental converters, scrolls,
  ccRO-specific consumables.
- Mounts, pet bonuses, ammo (arrows, bullets, kunai) with element.

## Items and inventory
- Items are picked through a search box, not a full item list like PoB's.
- Each build has an "inventory" of configured items (e.g. 3 weapons with
  different runes) for quick swapping without reconfiguring.
- "What if" comparisons like PoB: hovering an item or ticking a buff shows the
  damage change before committing.

## Target monster
- Any monster can be picked to check damage dealt and taken.
- Scaled Dungeon monsters are included as additional mobs; whether they get
  their own section next to the normal monsters is decided during
  development.
- Monster debuffs can be ticked (e.g. Lex Aeterna, Provoke, Decrease Agility,
  element changes).

## Calculations
- Formulas only; no simulated game, no movement or other gameplay (like PoB).
- Damage dealt: choose a skill and see its damage, like in PoB.
  - multi-hit skills shown per hit and in total
  - min/max/average, crit damage and crit chance, hit chance against the
    monster's flee
  - ASPD, cast time and cast delay, giving DPS
- Damage taken from the chosen monster (auto attacks and skills), with the
  player's DEF/MDEF, flee, perfect dodge, armor element and damage
  reductions.

## Builds: sharing and organizing
- Creating, duplicating, organizing, exporting and sharing builds must be
  easy.
- Sharing: PoB-style share codes, the build compressed into a string or URL
  fragment.
- Share codes carry a data version; an old build shows a hint like "made with
  data from patch X", because effects can change even though ids don't.
- Backups are the user's job; easy export and organizing support that.

## Quality goals
- Performance drives the technology choice, especially smooth filtering and
  searching.
- A clean app.

## Version history
- An app changelog, including ccRO-specific changes, is key for a public tool.
- It starts at 1.0: the launch must be good enough, and from then on people
  see what changes. No per-build revision history.

## Formula validation
- Done by the maintainer in dedicated test sessions: create characters in
  ccRO, rebuild them in the tool, compare against ccRO's training dummy.

## Legal
- GPL-3.0, with credit to rAthena ("based on rAthena").
- Disclaimer: unofficial, not affiliated with ccRO or Gravity; numbers are
  estimates.

## Decisions
- Separate public repo; GPL-3.0.
- No login, no backend, GitHub Pages, PWA with precached assets.
- ccRO only; pre-renewal jobs without rebirth, expanded classes included.
- Desktop browser first; mobile only if people complain.
- English only, data modelled for translation.
- Formulas only: damage dealt and taken, plus ASPD, cast time, cast delay,
  DPS; no movement or gameplay simulation.
- Monster debuffs, consumables, "what if" comparisons and Scaled Dungeon
  monsters are in.
- Sprites extracted from the client, RMS as fallback.
- Share codes rely on stable ids and carry a data version.
- Version history = app changelog from 1.0 on.
- Real product from the start, no prototypes.

## Open questions (deferred to development on purpose)
- Source of the ccRO-specific data.
- How rAthena effect scripts are converted.
- Where the extracted sprites are stored; asset caching details.
- Scaled Dungeon monsters: one picker or a separate section.

## Suggestions (Claude, not adopted)
