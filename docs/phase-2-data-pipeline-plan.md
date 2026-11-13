# Phase 2: Data pipeline, first cut — plan

Status: approved

Parent: [build-planner-plan.md](build-planner-plan.md), phase 2.

## Goal
A generator that reads rAthena's `db/pre-re` YAML from the local checkout,
merges ccRO overrides on top, and writes typed JSON with everything the
phase 3 auto-attack slice needs: jobs (stat bonuses, base ASPD per weapon
type, max levels, stat point table), all equipment without scripts,
monsters, and the size and element tables. The output is committed, carries
a data version (label + content hash) that share codes will use in phase 3,
and the deployed app shows that version in the footer.

## Out of scope
- Item scripts, effects, combos, refinement bonuses (`refine.yml`): phase 4.
- Skills, skill trees, ammo and other non-equipment items: phase 5.
- Monster skills (`mob_skill_db.txt`), HP/SP tables (`job_basepoints.yml`):
  phases 5 and 9.
- Runes, card system, costumes and any real ccRO data: phases 4 and 8. The
  maintainer confirmed that ccRO's base items are unchanged from rAthena; the
  only known difference is that vanilla cards are replaced by the card
  system. Cards are not equipment, so they are not generated here at all.
- Rebirth jobs, baby jobs, mounted job variants (`Knight2`, `Crusader2`,
  `Star_Gladiator2`; mounts are a build option in phase 6), Wedding.
- Pet armor and pet eggs.
- Any UI beyond the data version in the footer. No formula validation
  session: there are no calculations yet; the first one is in phase 3.

## Decisions
| Decision | Choice | Reason |
| --- | --- | --- |
| How CI gets the data | Generator runs locally (`pnpm data`); generated JSON is committed | CI and deploy need no rAthena checkout and no network; data changes are reviewable diffs. |
| Staleness guard | The generator records a hash of all files in `data-overrides/`; a Vitest test recomputes it and fails if it differs | CI catches "edited an override but forgot to regenerate", which committing the JSON would otherwise hide. Changes to rAthena itself are only picked up when the maintainer regenerates, by design. |
| Override format | YAML in rAthena's shape and field names, one file per kind | Familiar to anyone who knows rAthena; comments allowed for sources and patch notes. |
| Data version | Human label from `data-overrides/meta.yml` + first 8 hex chars of a SHA-256 over the generated data files | Share codes store the hash, the UI shows the label; the hash changes automatically with the data, so a forgotten label bump cannot hide a change. |
| Item scope | All equipment (weapons, armor, shields, headgear, garments, footgear, accessories), base fields only | Phase 4 adds effects without redoing the item schema; scripts are left out until phase 4 decides how to convert them. |
| Ids | rAthena ids for items and monsters; rAthena `e_job` values for jobs | Ids never change; share codes hold ids only. |
| Names | Display names in a separate `names.en.json` keyed by kind and id, not inside the records | The data model is meant for translation; another language becomes one more file. |
| Generator runtime | TypeScript run directly by Node (`node data-pipeline/generate.ts`) using built-in type stripping | No extra build step or `tsx` dependency. Needs Node ≥ 22.18 (unflagged type stripping); `.nvmrc` is 22 and the dev machine has 22.22. `engines` is raised to `>=22.18`. Type stripping forbids enums and namespaces, and relative imports need the `.ts` extension, so `tsconfig.json` gets `allowImportingTsExtensions`. |
| YAML parser | The `yaml` package, as a dev dependency | Maintained, typed, handles rAthena's files; only the generator uses it, nothing ships to the browser. |
| rAthena location | `--rathena <dir>` argument, else `RATHENA_DIR`, else the sibling `../rathena` | Matches the dev machine (`D:\Gits\rathena`) with no configuration. |
| Monster scope | Every entry in `mob_db.yml` (~1000) | rAthena's mob db has no spawn information to filter on; the override `Remove` list can drop entries later. |
| Output format | Pretty-printed JSON, records sorted by id, stable key order | Small, readable diffs when regenerating. Vite minifies JSON imports in the build. |

## Design

### Files
```
data-pipeline/
  generate.ts          entry point: resolve rAthena dir, run all steps, write output
  rathena.ts           read a db file incl. Footer imports; read commit hash and date
  overrides.ts         load and merge override files
  jobs.ts items.ts monsters.ts tables.ts   one converter per kind
  hash.ts              overrides hash and data hash
  fixtures/            tiny YAML inputs for the generator's unit tests
  *.test.ts
data-overrides/
  meta.yml             Label: "<data label>"
  jobs.yml items.yml monsters.yml   empty Body / Remove to start with
  README.md            the format, with examples
src/data/
  generated/           jobs.json items.json monsters.json tables.json
                       names.en.json meta.json  (never edited by hand)
  types.ts             TypeScript types for every generated file
  index.ts             typed exports of the generated data
  data.test.ts         sanity checks on the real generated data + staleness test
```
`src/data/generated/` is added to `.prettierignore` (the generator owns its
formatting) and stays in ESLint's scope only through `src/data/*.ts`.

### rAthena input
Files read from `<rathena>/db/pre-re/`: `job_stats.yml`, `job_aspd.yml`,
`job_exp.yml`, `statpoint.yml`, `item_db.yml` (follows its `Footer.Imports`;
only `item_db_equip.yml` is used), `mob_db.yml`, `size_fix.yml`,
`attr_fix.yml`. Files in `db/import` are ignored: ccRO differences live in
this repo's overrides, not in the local rAthena checkout. The commit hash and
commit date come from `git -C <rathena> log -1`; the generator warns (does
not fail) if `db/pre-re` has uncommitted changes, and records that in
`meta.json` as `rathenaDirty: true`.

### Override format
Each override file mirrors the rAthena file it applies to:
```yaml
# data-overrides/items.yml
Body:
  - Id: 1101          # existing id: only the listed fields change
    Attack: 30
  - Id: 1102
    Jobs:             # nested maps merge key by key, like rAthena's db/import
      Novice: false
  - Id: 990001        # unknown id: a new entry, must have every required field
    AegisName: Example_Sword
    Name: Example Sword
    Type: Weapon
    SubType: 1hSword
    ...
Remove:
  - 1103              # dropped from the output
```
Rules, enforced by the generator (it exits with a message naming file and
id):
- Merging happens on the rAthena-shaped records, before conversion, so
  overrides use rAthena field names and values.
- Scalars and lists replace; maps merge key by key.
- An unknown field name is an error (catches typos).
- A new entry missing a required field is an error.
- Removing an id that does not exist is an error.
- `jobs.yml` keys entries by rAthena job name (`Job: Swordman`) instead of
  `Id`, because rAthena's job files group several jobs per entry. Its
  patches apply per job after the groups are expanded.

### Generated data (shape, finalised in `src/data/types.ts`)
- **jobs.json**: per supported job: `id` (e_job value), `key` (rAthena
  name), `maxBaseLevel`, `maxJobLevel`, `bonusStats` (cumulative bonus per
  job level for str/agi/vit/int/dex/luk, so the engine reads one row),
  `baseAspd` (weapon type → base attack delay, only types the job can use,
  which also gives the job's usable weapon types). Plus `statPoints` (base
  level → total stat points) at the top level.
  Supported jobs: Novice, Swordman, Mage, Archer, Acolyte, Merchant, Thief,
  Knight, Priest, Wizard, Blacksmith, Hunter, Assassin, Crusader, Monk,
  Sage, Rogue, Alchemist, Bard, Dancer, Super Novice, Gunslinger, Ninja,
  Taekwon, Star Gladiator, Soul Linker. The id list is checked against
  `enum e_job` in rAthena's `src/common/mmo.hpp` while implementing. rAthena
  spells names differently per file (`Super_Novice`, `Supernovice`,
  `SuperNovice`); the generator maps each spelling to one key.
- **items.json**: per equipment item: `id`, `aegisName`, `type`
  (`weapon` | `armor`), `weaponType` (rAthena SubType, weapons only),
  `attack`, `defense`, `range`, `slots`, `weaponLevel`, `equipLevelMin`,
  `equipLevelMax`, `refineable`, `locations` (list), `jobs` (list of
  supported job ids, resolved from rAthena's item job names incl. `All` and
  `BardDancer`), `gender` if restricted. Items whose `Classes` exclude normal
  (non-rebirth) characters are dropped. Absent rAthena fields get rAthena's
  defaults (e.g. `Refineable` false, `Slots` 0).
- **monsters.json**: per monster: `id`, `aegisName`, `level`, `hp`,
  `attackMin`/`attackMax` (rAthena `Attack`/`Attack2`), `defense`,
  `magicDefense`, the six stats, `size`, `race`, `raceGroups`, `element`,
  `elementLevel`, `class` (normal/boss/guardian), `modes` (list of set
  flags), `attackRange`, `attackDelay`, `attackMotion`, `damageMotion`,
  `walkSpeed`. Drops and exp are not included. Absent rAthena fields get
  rAthena's defaults.
- **tables.json**: `sizeModifier` (weapon type → small/medium/large %,
  defaulting to 100 like rAthena) and `elementModifier` (element level 1–4 →
  attack element → defence element → %).
- **names.en.json**: `{ items: {id: name}, monsters: {id: name}, jobs: {id:
  name} }`.
- **meta.json**: `label`, `hash` (8 hex chars over the other generated
  files), `rathenaCommit`, `rathenaCommitDate`, `rathenaDirty`,
  `overridesHash`, `generatedAt`.

### App
`src/data/index.ts` exports the generated data with its types. The footer
shows `Data: <label> (<hash>) · rAthena <short commit>`. Nothing else in the
UI changes.

## Acceptance criteria
- [ ] `pnpm data` regenerates every file in `src/data/generated/` from
      `D:\Gits\rathena` without arguments, and running it twice gives no
      diff except `generatedAt`. (Unchanged inputs keep the same `hash`.)
- [ ] Spot checks on the generated data pass as tests: Sword (1101) has
      attack 25, weapon level 1, 3 slots; Poring (1002) has 50 HP, water
      element level 1; Swordman's base delay with no weapon is 400; Knuckle
      vs. large is 50 %; water attacking fire at level 1 is 150 %; the stat
      point total at base level 1 is 48; no baby, rebirth or mounted job and
      no pet item appears.
- [ ] Every supported job can equip at least one weapon, and every item's
      `jobs` list only contains supported job ids.
- [ ] Each override rule (patch, nested map merge, add, remove, unknown
      field, missing required field, unknown remove id) has a unit test with
      fixture YAML.
- [ ] Editing a file in `data-overrides/` without running `pnpm data`
      makes `pnpm test` fail with a message telling to run `pnpm data`.
- [ ] `meta.json` records the rAthena commit (`7f080871…` on the dev
      machine), the label, and the data hash.
- [ ] The built app's footer shows the data label, hash and rAthena commit;
      a component test asserts it.
- [ ] `data-overrides/README.md` documents the format with examples, and
      `data-pipeline/README.md` documents `pnpm data` and its options.
- [ ] The verification command passes, locally and in CI.

## Verification
```
corepack pnpm data && git diff --stat -- src/data/generated
corepack pnpm check && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```
The first line should show at most `meta.json` changing (`generatedAt`).
The maintainer's steps: open the deployed app and confirm the footer shows
the data version; skim the generated JSON for anything that looks wrong for
ccRO.

## Tasks
1. [x] Generator skeleton: add `yaml`, `pnpm data` script, raise `engines`
   to `>=22.18`, `allowImportingTsExtensions` in `tsconfig.json`;
   `rathena.ts` (resolve dir, load a db file with `Footer.Imports`, commit
   hash/date, dirty check) and `generate.ts` that runs with no steps yet.
   Check: verification passes; unit tests for the loader against fixtures;
   `pnpm data` prints the rAthena commit.
2. [x] Override layer: `overrides.ts` with the merge rules, `data-overrides/`
   files (`meta.yml` with a label, empty `jobs.yml`, `items.yml`,
   `monsters.yml`), format documented in `data-overrides/README.md`.
   Check: one unit test per rule; verification passes.
3. [x] Jobs: `jobs.ts` (supported job table with ids checked against
   rAthena's `e_job`, name spelling map, bonus stats, base ASPD, max levels,
   stat point table) writing `jobs.json` and the job part of
   `names.en.json`. Check: job spot checks pass; verification passes.
4. [x] Equipment: `items.ts` writing `items.json` and item names, with job
   resolution and the class filter. Check: item spot checks and the job id
   check pass; verification passes.
5. [x] Monsters: `monsters.ts` writing `monsters.json` and monster names.
   Check: monster spot checks pass; verification passes.
6. [x] Tables: `tables.ts` writing `tables.json` (size and element
   modifiers). Check: table spot checks pass; verification passes.
7. [x] Data version and typed access: `hash.ts`, `meta.json`,
   `src/data/types.ts`, `src/data/index.ts`, staleness test,
   `.prettierignore` entry, `data-pipeline/README.md`. Check: regenerating
   twice changes only `generatedAt`; editing an override without
   regenerating fails `pnpm test` (tried once, reverted); verification
   passes.
8. [x] Footer: show the data version from `src/data` in the app footer;
   component test. Check: verification passes; the built `dist` contains
   the label.

## Progress log
<!-- implement skill appends: date · task · result · commit -->
- 2026-11-13 · 1 generator skeleton (also added `@types/node@22` and
  `"node"` to `types`, plus `erasableSyntaxOnly`) · check/lint/test (12)/build
  pass, `pnpm data` prints commit 7f080871 · 9f42941
- 2026-11-13 · 2 override layer (jobs: patch only, no add/remove, since the
  job list is fixed) · check/lint/test (23)/build pass · 801b4b1
- 2026-11-13 · 3 jobs (ids verified against `enum e_job` on every run; added
  `json.ts` for compact one-line rows; `src/data/generated/` in
  `.prettierignore` already) · check/lint/test (37)/build pass · d8aec8d
- 2026-11-13 · 4 equipment, 1762 items (also drops costume-only items and
  items no supported job can use; Taekwon's only weapons are the four
  all-jobs items without a `Jobs` field, e.g. 1161 Balmung) ·
  check/lint/test (52)/build pass · 020d81d
- 2026-11-13 · 5 monsters, 1004 (`class` also has `battlefield`, used by 7
  rAthena monsters) · check/lint/test (57)/build pass · 6ebe23e
- 2026-11-13 · 6 tables (`elementModifier` is an array, index = element
  level - 1, like the other level tables) · check/lint/test (65)/build pass ·
  8ee5ab5
- 2026-11-13 · 7 data version and typed access (`types.ts` is the single
  source of record types, the generator imports them; `overridesHash` covers
  `data-overrides/*.yml` only, so README edits need no regeneration; a second
  test catches hand-edited generated files) · regenerating twice changed only
  `generatedAt`; appending a line to `items.yml` failed `pnpm test` with "Run
  `pnpm data`…", reverted; check/lint/test (72)/build pass · 52b4820
- 2026-11-13 · 8 footer · check/lint/test (73)/build pass; `dist` JS
  contains "ccRO 2026-11" and no item/monster data (bundle +0.45 kB) · next
  commit
