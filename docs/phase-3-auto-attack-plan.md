# Phase 3: Vertical slice, auto attack — plan

Status: approved

Parent: [build-planner-plan.md](build-planner-plan.md), phase 3. Data comes
from phase 2 ([plans/archive/phase-2-data-pipeline-plan.md](plans/archive/phase-2-data-pipeline-plan.md)).

## Goal
The first end-to-end feature in the deployed app: pick a job, base and job
level, distribute stats within the point budget, pick one weapon by search
and a target monster by search, and see the auto attack result: min/max/
average damage, crit damage and crit chance, hit chance, ASPD and DPS, plus
the status window values (ATK, HIT, FLEE, CRIT, ASPD) the maintainer can
compare in game. The build is autosaved in the browser and shared as a
link that carries the data version. The phase ends with the first
validation session at ccRO's training dummy, recorded as test fixtures.

## Out of scope
- Any equipment slot other than the right-hand weapon; refinement, cards,
  runes, item scripts, weapon element from scripts: phase 4. The weapon is
  always neutral, unrefined, without cards.
- Assassin dual wielding (left-hand weapon): phase 4, with equipment slots.
- Shields and their ASPD penalty: phase 4.
- Items that raise the ASPD cap above 190 (ccRO has some): phase 4. The
  engine takes the cap from a config value so phase 4 only changes inputs.
- Skills, passives (e.g. Double Attack, Weapon Mastery), ammo: phase 5.
  Bows and guns compute with no ammo (0 ammo ATK, neutral); the UI says so.
- Buffs, mounts, monster debuffs: phase 6. Expanded class mechanics
  (Taekwon kicks, Super Novice bonuses, Gunslinger/Ninja specifics):
  phase 7. All 26 supported jobs are selectable; their base formulas apply.
- Special monster modes that change damage (plants taking 1 damage, etc.)
  and damage taken: phase 9.
- Named build lists, duplicate/import/export (import accepts share codes
  and the readable build JSON): phase 10. Only the current
  build is kept.
- Comparing results across several targets or dummies side by side:
  phase 10. One target is selected at a time.
- Sprites, PWA: phase 11. Gender selection: no weapon in the data needs it
  beyond what Bard/Dancer already imply.

## Decisions
| Decision | Choice | Reason |
| --- | --- | --- |
| Formula authority | rAthena pre-renewal code paths (`#ifndef RENEWAL`) in `D:\Gits\rathena\src\map\battle.cpp`, `status.cpp`, `pc.cpp`, at the commit recorded in `meta.json`; each engine function names the rAthena function it follows | ccRO runs on rAthena; validation then only has to find ccRO's deviations. |
| Server settings | An `EngineConfig` with rAthena defaults: `maxStat` 99, `maxAspd` 190, `minHitRate` 5, `maxHitRate` 100 | Maintainer confirmed ccRO uses the defaults; ASPD can go higher with some items, which phase 4 handles by changing the config input, not the formulas. |
| Engine inputs | Resolved data objects (`Job`, `Item \| null`, `Monster`, `TablesFile`, config), not ids | Engine stays pure and testable with hand-made records; id resolution lives in `src/build`. |
| Average damage | Exact expected value, enumerating the random parts (weapon variance, monster soft DEF), not `(min + max) / 2` | Integer rounding, the minimum-damage floor and DEX capping make the midpoint wrong. |
| DPS | `attacksPerSecond × (critChance × avgCrit + (1 − critChance) × hitChance × avgNormal)`; crits always hit | Matches what ccRO's DPS meter measures over time (misses count as 0). |
| Ranged weapons | Bows and guns included with no ammo; whips, instruments, bows and guns use DEX as the main ATK stat, as `status_base_atk` does | Maintainer's choice; validation starts with melee weapons. |
| Stat budget | Base stats 1..`maxStat`; cost per point from rAthena's pre-renewal `PC_STATUS_POINT_COST(x) = 1 + (x + 9) / 10` (integer division); total from `jobsData.statPoints[baseLevel − 1]`. Going over budget is allowed and shown as an error, not prevented | Lowering the level of a shared build must not silently destroy its stats. |
| Weapon search | Case-insensitive substring over English name, aegis name and id; only weapons the job can equip at the base level (`jobs`, `equipLevelMin/Max`); "No weapon" (bare hands, `Fist`) is always available; at most 50 results shown | 1762 items is small; filtering by job removes most noise. |
| Monster search | Same matching over the monster's name, aegis name and id; at most 50 results | Same reason. |
| Build model | `{ v: 1, job, baseLevel, jobLevel, stats: {str..luk}, weapon: id \| null, dummies: Dummy[], target: { monster: id } \| { dummy: index } \| null }` | Ids only for game data (master plan); dummies are the user's own records, so they are stored by value. `v` lets later phases migrate old builds; `v: 1` is changed in place because no link has been published yet. |
| Share code | Opaque binary code, base64url, in the URL fragment `#b=<code>`. Bytes: format version (1), then tagged fields as varint tag + varint value (1 job, 2 base level, 3 job level, 4–9 STR..LUK, 10 weapon with 0 = none, 11 target monster id, 12 target dummy index + 1, 13 one dummy record; 11 and 12 are mutually exclusive), tag 0 ends the fields. A dummy record (tag 13, repeated in list order) is: name as varint length + UTF-8, then varints in fixed order level, DEF, MDEF, STR, AGI, VIT, INT, DEX, LUK, size index, race index, element index, element level; the size/race/element index tables are part of the format and are only ever appended to. After the fields: then the data hash as 4 raw bytes and the data label as varint length + UTF-8. No compression. A newer format version, an unknown tag, truncation or trailing bytes make the code undecodable; decoded fields go through build normalize | Maintainer's choice after measuring: a typical code is ~48 characters (link ~102), where deflated JSON gave ~174 (link ~228). The code is not meant to be read or edited; later phases add tags or bump the version, and old links must keep decoding. Phase 10 import accepts these codes. |
| Data version hint | When a decoded code's or saved build's `d` differs from the current `dataMeta.hash`, a notice shows "Made with data <l> (<d>); current data is <label> (<hash>). Numbers may differ." | Idea file: old builds show which data they were made with. |
| Invalid content on decode | Unknown ids and out-of-range values are dropped or clamped, each with a visible warning; a code that cannot be decoded at all shows an error and leaves the current build untouched | A removed item must not make a whole build unreadable. |
| Saving | Current build autosaved to `localStorage` (key `ccro-build-planner:current`) as readable JSON: the build model plus `d` (data hash) and `l` (data label), all access in try/catch; restored on load through build normalize, with the same warnings and data version hint as a link | Maintainer's choice: users may read, edit or generate this JSON with their own tools; phase 10 import also accepts it. Build lists are phase 10. |
| Opening a share link | If the link's build differs from the saved one, ask before replacing it (`confirm`); then remove the fragment from the URL | Following a link must not silently overwrite work. |
| Training dummy | ccRO's dummy is configurable per player, so builds hold their own **dummies**: up to 20 per build, each with a name (1–30 characters, default "Dummy N") and the settings the game offers: level 1–99; DEF, MDEF, STR, AGI, VIT, INT, DEX, LUK 1–999; size; race (Formless, Undead, Brute, Plant, Insect, Fish, Demon, Demihuman, Angel, Dragon); element (the 10 elements) with element level 1–4. A dummy can be added, edited, renamed, removed and selected as the target instead of a monster. Engine-wise it becomes a `Monster` record with class `normal`, no modes and no race groups; HP is not configurable and shown as "–" | Maintainer: every stat is configurable in game except HP and the boss flag, which can be neither seen nor changed. Several dummies per build let one build be tested against different setups. |
| Dummy normalize | Out-of-range numbers are clamped and unknown size/race/element values replaced by the default (medium, Formless, Neutral), each with a warning; an empty or too long name is replaced or cut with a warning; dummies beyond 20 are dropped with a warning; a target dummy index that does not exist clears the target with a warning | Same rule as for ids: bad content must not make a build unreadable. |
| Fixture format | YAML in `tests/fixtures/auto-attack/`, one file per validated character | Comments for in-game notes; `yaml` is already a dev dependency. |
| Fixture comparison | Status window values must match exactly; observed min/max damage must lie inside the computed range (observations are a sample) and, if marked `rangeComplete: true`, equal it; observed crit damage must equal the computed crit range bounds it falls in; DPS: the training dummy's 5-second windows from one session, first and last dropped as partial, mean + 0.4 (the dummy prints damage ÷ 5 rounded down) within ±5 %, a wider per-fixture tolerance only with a reason | The in-game sample cannot prove extremes; short DPS windows swing by 20 % and more, so DPS needs a session of 2 minutes or longer. |

## Design

### Files
```
src/engine/
  config.ts          EngineConfig + rAthenaDefaults
  stats.ts           total stats (base + job bonus), stat point cost/budget
  status.ts          status window values: ATK (base + weapon), HIT, FLEE, CRIT, ASPD
  autoAttack.ts      damage per hit (normal, crit), hit and crit chance vs. a monster, DPS
  *.test.ts          hand-computed cases, each comment citing the rAthena line it follows
src/build/
  model.ts           Build type, default build, normalize (clamp, drop unknown ids, warnings)
  dummy.ts           Dummy type, defaults, normalize, conversion to an engine Monster
  resolve.ts         Build -> engine inputs (job, weapon item, monster) from src/data
  search.ts          weapon and monster search
  shareCode.ts       encode/decode, data version comparison
  storage.ts         localStorage load/save
  *.test.ts
src/app/
  App.svelte         layout from phase 1, regions filled by the components below
  BuildPanel.svelte  job, levels, stats with budget, weapon search
  TargetPanel.svelte target choice (monster search or one of the build's dummies), target stats
  DummyEditor.svelte add, edit, rename, remove dummies
  ResultsPanel.svelte status values, auto attack numbers, notes on what is not modelled
  ShareBar.svelte    copy link, data version hint, decode warnings
  build.svelte.ts    the reactive build state (Svelte 5 runes), autosave
tests/fixtures/
  auto-attack/*.yml  validated characters
  fixtures.test.ts   runs every fixture through the engine
```

### Engine interface (shape; final names may differ)
```ts
interface CharacterInput {
  job: Job; baseLevel: number; jobLevel: number;
  baseStats: BonusStats; weapon: Item | null;
}
function totalStats(input): BonusStats;               // base + job bonus row
function statPointsSpent(baseStats): number;
function statusWindow(input, config): { atk: [number, number]; hit; flee; crit; aspd };
function autoAttack(input, monster, tables, config): {
  normal: { min; max; avg };  crit: { min; max; avg };
  hitChance; critChance;      // 0..1
  aspd; attacksPerSecond; dps;
};
```
Formula notes for the implementer (verify every one against the rAthena
source, pre-renewal branch; the source wins):
- Base ATK: `status_base_atk` (status.cpp). DEX-main weapon types:
  Bow, Musical, Whip, Revolver, Rifle, Gatling, Shotgun, Grenade.
- Weapon damage, variance by weapon level, DEX lower bound, size modifier:
  `battle_calc_base_damage` (battle.cpp). Bare hands use `Fist`.
- Element: `battle_calc_element_damage`; attack element is Neutral, table
  `tables.elementModifier[monster.elementLevel − 1].Neutral[monster.element]`.
- DEF: `battle_calc_defense_reduction` (hard DEF % and monster VIT soft DEF);
  crits ignore DEF.
- Hit: `is_attack_hitting` (80 + HIT − FLEE, clamped by config); player HIT
  and monster FLEE from `status_calc_misc` / `status_calc_pc_`.
- Crit: `is_attack_critical` and the player's CRIT from `status_calc_pc_`
  (LUK, Katar doubling, target LUK reduction).
- ASPD: `status_base_amotion_pc` with `job.baseAspd[weaponType]`, capped by
  `config.maxAspd`; `attacksPerSecond = 1000 / (2 × amotion)`; displayed
  ASPD `(2000 − amotion) / 10`.
- Status window values as the client shows them: `clif_initialstatus` /
  `clif_updatestatus` in clif.cpp.
- Minimum damage 1 per hit (before element, as rAthena does — check).

### Fixture format
```yaml
name: Swordman 50/30 Sword
validatedOn: 2026-11-20
dataHash: a1000f15          # data version used; informational
build: { v: 1, job: 1, baseLevel: 50, jobLevel: 30,
         stats: { str: 50, agi: 30, vit: 30, int: 1, dex: 30, luk: 1 },
         weapon: 1101,
         dummies: [{ name: Default dummy, level: 1, def: 1, mdef: 1,
                     str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1,
                     size: medium, race: Formless, element: Neutral,
                     elementLevel: 1 }],
         target: { dummy: 0 } }
observed:
  status: { atk: [n, n], hit: n, flee: n, crit: n, aspd: n }
  normal: { min: n, max: n, rangeComplete: false }
  crit: { min: n, max: n }      # optional
  dps:                          # optional, the dummy's windows from one session
    windows: [n, n, n]
notes: free text
```

### UI
The three regions from phase 1 get real content; the banner stays.
- **Build**: job select (display names from `names.en.json`), base and job
  level inputs clamped to the job's maximums, six stat rows (base input,
  job bonus, total, cost of the next point), points left (red when
  negative), weapon search with "No weapon".
- **Target**: choose a monster by search or one of the build's dummies;
  the chosen target's level, HP ("–" for dummies), size, race, element and
  level, DEF, VIT, FLEE, LUK. A dummy list with "Add dummy" and, per
  dummy, select, edit (all settings and the name) and remove.
- **Results**: status window values; normal hit min/max/avg, crit
  min/max/avg, hit chance, crit chance, ASPD, attacks per second, DPS; a
  short line listing what is not modelled yet (refinement, cards, skills,
  buffs, ammo for bows/guns). Without a monster, only the status values.
- **Share bar**: "Copy share link", the data version hint and decode
  warnings when present.

## Acceptance criteria
- [ ] Engine unit tests cover, with hand-computed expected values: base ATK
      for a STR and a DEX weapon, weapon variance by weapon level, size and
      element modifiers (incl. a 0 % case such as Neutral vs Ghost level 4),
      hard and soft DEF, crits ignoring DEF, hit chance clamped at both ends,
      Katar crit, ASPD for bare hands and two weapon types incl. the 190 cap,
      and the stat point cost/budget (`statPointsSpent` of all 1s is 0; level
      1 budget is 48).
- [ ] `avg` equals the exact expected value; a test checks it against brute
      force enumeration for at least one case with DEF and variance.
- [ ] Build normalize: an unknown weapon or monster id is dropped with a
      warning; levels and stats out of range are clamped with a warning; a
      weapon the job cannot equip is dropped with a warning.
- [ ] Share codes round-trip: `decode(encode(build))` returns the same build
      and data hash; a code with another data hash produces the data version
      hint; a corrupted code returns an error and no build.
- [ ] A typical phase 3 build's share link is under 200 characters.
- [ ] Storage: the build survives a reload (component test with jsdom
      `localStorage`); a throwing `localStorage` does not break the app.
- [ ] Component tests: choosing job, stats, weapon and monster shows the
      auto attack numbers from the engine; over-budget stats are flagged;
      opening a `#b=` link loads that build.
- [ ] Weapon search only lists weapons the selected job can equip at the
      selected base level.
- [ ] `tests/fixtures/fixtures.test.ts` runs every fixture; at least one
      fixture from the validation session exists and passes, or the
      deviation it reveals is listed under "Validation findings" in this
      plan with a follow-up.
- [ ] Training dummies: a build holds up to 20 named dummies with the
      settings and ranges from "Training dummy"; they can be added, edited,
      renamed, removed and selected as the target, and selecting one shows
      its auto attack numbers (component test).
- [ ] Dummies survive a reload and round-trip through share codes and the
      readable JSON; normalize clamps out-of-range dummy values, replaces
      unknown size/race/element, fixes names, drops dummies beyond 20 and
      clears a missing target dummy, each with a warning.
- [ ] A typical phase 3 build with one dummy as target still has a share
      link under 200 characters.
- [ ] The verification command passes locally and in CI; the deployed app
      shows the slice.

## Verification
```
corepack pnpm check && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```
Maintainer's steps: in the deployed app, build a character, copy the share
link, open it in another browser and confirm the same numbers. Then the
validation session: create characters in ccRO, compare ATK/HIT/FLEE/CRIT/
ASPD, hit damage, crit damage and the DPS meter against the training dummy,
and hand the numbers over for fixtures.

## Tasks
1. [x] Housekeeping: tick phase 2 in `build-planner-plan.md`, add its
   progress-log line (archived plan, `0ba2d1c`), and record that the phase 2
   open item is settled: the other `db/` base files (`job_stats.yml`,
   `statpoint.yml`, `attr_fix.yml`, `mob_db.yml`, `item_db.yml`) have empty
   bodies and only import `db/pre-re`, so only `size_fix.yml` needed the
   base merge. Mark the share code open question as decided (this plan).
   Check: lint passes.
2. [x] Engine stats: `config.ts`, `stats.ts` (total stats, point cost,
   budget). Check: unit tests; verification passes.
3. [x] Engine status window: `status.ts` (ATK, HIT, FLEE, CRIT, ASPD incl.
   cap). Check: unit tests; verification passes.
4. [x] Engine auto attack: `autoAttack.ts` (normal and crit damage with
   exact average, hit and crit chance, DPS). Check: unit tests incl. brute
   force average; verification passes.
5. [x] Build model: `model.ts`, `resolve.ts`, `search.ts` with normalize
   warnings. Check: unit tests; verification passes.
6. [x] Share code and storage: `shareCode.ts`, `storage.ts`. Check:
   round-trip, hint, corrupt code and storage tests; verification passes.
7. [x] UI: build state, Build/Target/Results panels, share bar, link
   opening with confirm. Check: component tests; verification passes; the
   built app renders a result for a sample build.
8. [x] Fixture runner: `tests/fixtures/fixtures.test.ts` and the format,
   with one synthetic fixture (marked `synthetic: true`, from engine output
   against Poring) so the runner is tested before real data exists; update
   `tests/fixtures/README.md`. Check: verification passes.
9. [x] Training dummies: `dummy.ts`; build model `monster` replaced by
   `dummies` + `target` (model, normalize, resolve, share code tags 11–13,
   storage, fixtures, synthetic fixture moved to a dummy); Target panel and
   `DummyEditor.svelte`. Check: unit and component tests for the dummy
   criteria; verification passes.
10. [ ] Validation session: **maintainer's numbers.** Record each validated
    character as a fixture, with the dummy settings used; fix formula deviations or log them under
    "Validation findings". Remove the synthetic fixture. Check: verification
    passes.

## Validation findings
<!-- deviations between engine and ccRO found in task 10 -->
No formula deviations: all 8 validated characters match the status window
exactly, every observed hit lies inside the engine's range, crits equal the
engine's crit damage, and the damage histograms fit the engine's
distribution. Long-session DPS (2–5 min) is within ±2.1 % after the
rounding correction.
- **Training dummy DPS rounds down.** The dummy prints the 5-second damage ÷ 5
  without decimals; raw means were below the engine in 4 of 5 sessions by
  0.2–0.5 DPS. Handled in the fixture rule (+0.4). Not a formula deviation.
- **Crit rate at LUK 1 looks high (open).** The DEX Novice and both Swordman
  long sessions show 9 crits where the engine expects about 3.9 (CRIT 1,
  critRate 13 − 2 × dummy LUK 1 = 1.1 %); chance alone gives this about
  1.6 % of the time. LUK 20 fits (18 crits vs 17.4). Follow-up: a 10-minute
  Swordman session on the plain dummy (maintainer, pending).
- **Blade top roll (closed).** The long Swordman sessions never showed the
  highest normal hit (80 plain, 42 armored), but the first session did record
  80 on the plain dummy, so the roll exists; the armored gap is chance (~3 %).

## Progress log
<!-- implement skill appends: date · task · result · commit -->
- 2026-11-13 · 1 housekeeping: phase 2 ticked and logged in the master plan, base-file open item settled (verified: the five `db/` base files only hold imports), share code question marked decided · lint passes · 43c3609
- 2026-11-13 · 2 engine stats: config, total stats, point cost/budget (99 → 628 points, level 1 budget 48) · check/lint/test (87)/build pass · f22b12d
- 2026-11-13 · 3 engine status window: base ATK (STR/DEX main), HIT, FLEE, perfect dodge, CRIT incl. katar doubling, amotion/ASPD with config cap; status window ASPD truncated (to confirm in validation) · check/lint/test (99)/build pass · 5ed84bd
- 2026-11-13 · 4 engine auto attack: pre-renewal base damage (DEX minimum × weapon level, `rnd()%(max−min)+min` so normal hits never roll the full ATK, bow arrow path, gun crits melee-like), size, hard/soft DEF, min 1, Neutral element, katar 1% off-hand hit, exact average by enumeration, hit/crit chance, DPS · check/lint/test (120)/build pass · 7d19263
- 2026-11-13 · 5 build model: normalize (unknown ids dropped, levels/stats clamped, unequippable weapon dropped, each with a warning), resolve, weapon/monster search · check/lint/test (141)/build pass · c0dc1ab
- 2026-11-13 · plan change agreed with the maintainer: the plan's deflated-JSON share code measured ~174 characters (link ~228, over the 200 limit). The share code is now an opaque binary format (link ~110), and storage keeps readable JSON (build + `d` + `l`) that users may edit; phase 10 import accepts both
- 2026-11-13 · 6 share code and storage: binary code (typical link ~110 chars), readable JSON storage with `d`/`l`, hint, corrupt-code and throwing-storage tests · check/lint/test (159)/build pass · ae9166b
- 2026-11-13 · 7 UI: build state (runes), Build/Target/Results panels, share bar with copy link, data hint, warnings, load errors; autosave; `#b=` link opening with confirm and fragment removal; a weapon the new job/level cannot equip is removed with a notice; garbage codes are no longer reported as "newer version" · check/lint/test (171)/build pass; built app rendered headless in Chrome for a Swordman/Sword/Poring link (status window, damage table, DPS shown). Bundle is ~1 MB minified (126 kB gzip) because the data JSON is bundled; Vite warns about chunk size · 4c54266
- 2026-11-13 · 8 fixture runner: `tests/fixtures/fixtures.test.ts` + `compare.ts` (exact status window, damage sample inside range or equal when `rangeComplete`, exact crit, DPS ±5 %), synthetic Swordman/Poring fixture, README format · check/lint/test (179)/build pass · 5940a27
- 2026-11-13 · plan change agreed with the maintainer: ccRO's training dummy is configurable per player (level 1–99; DEF, MDEF, STR, AGI, VIT, INT, DEX, LUK 1–999; size, race, element, element level 1–4; HP and boss flag not configurable). Task 9 is now "configurable dummies, several per build, one selected target"; build model, share code and acceptance criteria updated
- 2026-11-13 · 9 training dummies: `dummy.ts` (settings, normalize with warnings, engine monster record), build `dummies` + `target`, share code tags 11–13 (link 112 chars with a monster, 150 with a configured dummy), Target panel with `DummyEditor.svelte` (add, edit, rename, remove, select; at most 20), synthetic fixture moved to a dummy; worst-case dummy (VIT/DEF 999) computes in < 1 ms · check/lint/test (201)/build pass · 4b92fa7
