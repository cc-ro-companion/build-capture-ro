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
- Named build lists, duplicate/import/export: phase 10. Only the current
  build is kept.
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
| Build model | `{ v: 1, job, baseLevel, jobLevel, stats: {str..luk}, weapon: id \| null, monster: id \| null }` | Ids only (master plan); `v` lets later phases migrate old builds. |
| Share code | Versioned build JSON plus `d` (data hash) and `l` (data label), compressed with the built-in `CompressionStream('deflate-raw')`, base64url, in the URL fragment `#b=<code>` | Maintainer's choice; no dependency, extends as later phases add fields, the fragment never reaches a server. |
| Data version hint | When a decoded code's `d` differs from the current `dataMeta.hash`, a notice shows "Made with data <l> (<d>); current data is <label> (<hash>). Numbers may differ." | Idea file: old builds show which data they were made with. |
| Invalid content on decode | Unknown ids and out-of-range values are dropped or clamped, each with a visible warning; a code that cannot be decoded at all shows an error and leaves the current build untouched | A removed item must not make a whole build unreadable. |
| Saving | Current build autosaved to `localStorage` (key `ccro-build-planner:current`, same JSON as the uncompressed share payload), all access in try/catch; restored on load | Maintainer's choice; build lists are phase 10. |
| Opening a share link | If the link's build differs from the saved one, ask before replacing it (`confirm`); then remove the fragment from the URL | Following a link must not silently overwrite work. |
| Training dummy | Entered as a ccRO monster in `data-overrides/monsters.yml` once the maintainer has its stats (size, race, element and level, DEF, VIT, AGI, LUK, level, HP) | Unknown today; the maintainer reads it off in game. Fixtures target that entry. |
| Fixture format | YAML in `tests/fixtures/auto-attack/`, one file per validated character | Comments for in-game notes; `yaml` is already a dev dependency. |
| Fixture comparison | Status window values must match exactly; observed min/max damage must lie inside the computed range (observations are a sample) and, if marked `rangeComplete: true`, equal it; observed crit damage must equal the computed crit range bounds it falls in; DPS within ±5 % | The in-game sample cannot prove extremes; the DPS meter averages over a time window. |

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
  resolve.ts         Build -> engine inputs (job, weapon item, monster) from src/data
  search.ts          weapon and monster search
  shareCode.ts       encode/decode, data version comparison
  storage.ts         localStorage load/save
  *.test.ts
src/app/
  App.svelte         layout from phase 1, regions filled by the components below
  BuildPanel.svelte  job, levels, stats with budget, weapon search
  TargetPanel.svelte monster search and its relevant stats
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
         weapon: 1101, monster: <training dummy id> }
observed:
  status: { atk: [n, n], hit: n, flee: n, crit: n, aspd: n }
  normal: { min: n, max: n, rangeComplete: false }
  crit: { min: n, max: n }      # optional
  dps: n                        # optional, from the DPS meter
notes: free text
```

### UI
The three regions from phase 1 get real content; the banner stays.
- **Build**: job select (display names from `names.en.json`), base and job
  level inputs clamped to the job's maximums, six stat rows (base input,
  job bonus, total, cost of the next point), points left (red when
  negative), weapon search with "No weapon".
- **Target**: monster search; the chosen monster's level, HP, size, race,
  element and level, DEF, VIT, FLEE, LUK.
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
- [ ] The training dummy exists as a monster override and is searchable.
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
6. [ ] Share code and storage: `shareCode.ts`, `storage.ts`. Check:
   round-trip, hint, corrupt code and storage tests; verification passes.
7. [ ] UI: build state, Build/Target/Results panels, share bar, link
   opening with confirm. Check: component tests; verification passes; the
   built app renders a result for a sample build.
8. [ ] Fixture runner: `tests/fixtures/fixtures.test.ts` and the format,
   with one synthetic fixture (marked `synthetic: true`, from engine output
   against Poring) so the runner is tested before real data exists; update
   `tests/fixtures/README.md`. Check: verification passes.
9. [ ] Training dummy: **needs the maintainer's in-game stats.** Add it to
   `data-overrides/monsters.yml`, run `pnpm data`. Check: it appears in
   monster search; verification passes.
10. [ ] Validation session: **maintainer's numbers.** Record each validated
    character as a fixture; fix formula deviations or log them under
    "Validation findings". Remove the synthetic fixture. Check: verification
    passes.

## Validation findings
<!-- deviations between engine and ccRO found in task 10 -->

## Progress log
<!-- implement skill appends: date · task · result · commit -->
- 2026-11-13 · 1 housekeeping: phase 2 ticked and logged in the master plan, base-file open item settled (verified: the five `db/` base files only hold imports), share code question marked decided · lint passes · 43c3609
- 2026-11-13 · 2 engine stats: config, total stats, point cost/budget (99 → 628 points, level 1 budget 48) · check/lint/test (87)/build pass · f22b12d
- 2026-11-13 · 3 engine status window: base ATK (STR/DEX main), HIT, FLEE, perfect dodge, CRIT incl. katar doubling, amotion/ASPD with config cap; status window ASPD truncated (to confirm in validation) · check/lint/test (99)/build pass · 5ed84bd
- 2026-11-13 · 4 engine auto attack: pre-renewal base damage (DEX minimum × weapon level, `rnd()%(max−min)+min` so normal hits never roll the full ATK, bow arrow path, gun crits melee-like), size, hard/soft DEF, min 1, Neutral element, katar 1% off-hand hit, exact average by enumeration, hit/crit chance, DPS · check/lint/test (120)/build pass · 7d19263
