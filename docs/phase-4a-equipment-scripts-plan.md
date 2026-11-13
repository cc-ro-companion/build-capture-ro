# Phase 4a: Equipment, refinement and item scripts — plan

Status: approved

Parent: [build-planner-plan.md](build-planner-plan.md), phase 4, first half.
Follows phase 3 ([plans/archive/phase-3-auto-attack-plan.md](plans/archive/phase-3-auto-attack-plan.md)).
Phase 4b ([phase-4b-runes-combos-inventory-plan.md](phase-4b-runes-combos-inventory-plan.md))
builds on the effect model defined here.

## Goal
A build can wear a full set of equipment: every slot, each item refined,
including shields and Assassin dual wielding. rAthena item scripts are
converted into effects by the data pipeline, and the engine applies the
effects that matter for auto attack. The status window and auto attack
results then reflect the gear. Scripts the pipeline cannot convert, and
bonuses the engine does not compute yet, are listed in a coverage report
and shown in the UI as "not modelled", so a number never looks complete
when it isn't. Items marked hidden in the review list stop showing up in
search. Old share links and saved builds keep working.

## Out of scope
- Runes, item combos and the per-build inventory: phase 4b.
- Vanilla rAthena cards: ccRO uses runes in card slots (maintainer), so
  `item_db_etc.yml` cards are never offered.
- Computing bonuses that only matter for skills, magic, cast time, damage
  taken, autocast/autobonus, drops, healing or regen. They are parsed and
  stored now. Phases 5, 6 and 9 compute them.
- Skill-based effects (Righthand/Lefthand Mastery, Weapon Mastery):
  phase 5. Dual wield uses mastery level 0 until then.
- Costumes and the card album: phase 8.
- Validation session: the single session at the end of phase 4b covers
  4a's gear as well (maintainer's choice).

## Decisions
| Decision | Choice | Reason |
| --- | --- | --- |
| Split of phase 4 | 4a: slots, refinement, shields/dual wield, effect model, script conversion. 4b: runes, combos, inventory | Maintainer's choice; 4b's runes are written in rAthena script, so the parser must exist first. |
| Script conversion | The pipeline parses a defined subset of rAthena script into an effect AST stored in `items.json`; an item whose script falls outside the subset gets `effects: null` plus a reason in the coverage report. A hand fix is a rewritten `Script:` in `data-overrides/items.yml`, which the parser then reads like any other | Maintainer's choice ("parser + hand overrides"); the override layer already accepts `Script`, so there is one path for both. |
| Parsed subset | Statements: `bonus`/`bonus2`/`bonus3`/`bonus4`/`bonus5 bX,args;`, `if (...) {...} else if/else {...}` with or without braces, `.@var = expr;`. Expressions: integer and string literals, rAthena constants (`RC_*`, `Ele_*`, `Size_*`, `Class_*`, `RC2_*`, `bStr`…, `Job_*`, `EAJL_*`, `EAJ_*`), `.@var`, `getrefine()`, `readparam(bX)`, `BaseLevel`, `JobLevel`, `BaseJob`, `Class`, `eaclass()`, `getskilllv("X")`/`getskilllv(ID)`, `+ - * / %`, comparisons, `&&`, `\|\|`, `!`, `&`, parentheses. Anything else (`autobonus*`, `bonus_script`, `skill`, `getequipid`, `callfunc`, `switch`, `for`, `set`, sounds and effects) makes the item unsupported unless the statement is a known no-op | Covers the ~1,000 plain scripts and most of the ~450 conditional ones while staying small enough to test exhaustively. `getskilllv` evaluates to 0 until phase 5. |
| Runtime evaluation | The engine evaluates the AST per equipped item with a context (that item's refine, total stats before item bonuses, base/job level, job, skill levels = 0), then collects `bonus` calls into a `BonusSet` | Refine and job conditions must be evaluated per build; doing it at runtime keeps the data small and exact. |
| `readparam` order | Uses stats after base + job bonus but before equipment bonuses; verify against rAthena's `status_calc_pc` order | rAthena runs item scripts in sequence on `sd->param_bonus`; for conditions that read stats this matches in practice. Note any deviation in the fixture notes. |
| Bonuses the engine computes in 4a | Those that change the status window or auto attack: `bStr`…`bLuk`, `bAllStats`, `bAgiVit`, `bAgiDexStr`; `bBaseAtk`, `bAtkRate`, `bHit`, `bHitRate`, `bFlee`, `bFlee2`, `bCritical`, `bCriticalRate`, `bCritAtkRate`, `bCriticalAddRace`, `bAspd`, `bAspdRate`, `bAtkEle`, `bAddRace`, `bAddRace2`, `bAddEle`, `bAddSize`, `bAddClass`, `bIgnoreDefRace`, `bIgnoreDefClass`, `bIgnoreDefRaceRate`, `bIgnoreDefClassRate`, `bDefRatioAtkRace`, `bDefRatioAtkClass`, `bLongAtkRate`, `bNoSizeFix`, `bPerfectHitRate`, `bDef`, `bDefRate`, `bMdef`, `bMaxHP`/`bMaxHPrate`, `bMaxSP`/`bMaxSPrate`. The implementer checks each against `pc_bonus`/`pc_bonus2` and the pre-re damage path and may add or drop names with a reason in the progress log | Maintainer's choice: auto-attack relevant only. HP/SP/DEF/MDEF are cheap and the status window shows them. |
| "Not modelled" display | Each equipped item shows its unsupported script reason or the names of its parsed bonuses the engine does not compute, in plain words from a bonus-name → label table; results show a summary line "N effects not modelled" | A missing effect must be visible, never silent. |
| Coverage report | `pnpm data` writes `docs/script-coverage.md`: totals, then per reason the unsupported items (id, name, the offending statement), then computed / stored-only bonus counts. It is generated, not edited; the test that guards generated data also guards it | The maintainer picks which items to fix by hand from it; it shows progress over time. |
| Equipment slots | `headTop`, `headMid`, `headLow`, `armor`, `garment`, `shoes`, `accessoryLeft`, `accessoryRight`, `rightHand`, `leftHand`. A multi-location headgear (e.g. `Head_Top`+`Head_Mid`) fills every slot it covers, and equipping it clears what it overlaps. A two-handed weapon (`Both_Hand`) clears `leftHand`. `leftHand` takes a shield, or a one-handed weapon for Assassin (rAthena's dual wield weapon types) | Mirrors the game's equip window; one place per rAthena location. |
| Equipped item | `{ item: id, refine: 0..10 }`; refine only when the item is `refineable`, otherwise forced to 0 with a warning | Maintainer: ccRO refinement matches rAthena, max +10. |
| Refinement | Pipeline reads `db/pre-re/refine.yml` into `tables.refine`: per group (Armor, Weapon level 1–4) the bonus per level and the overupgrade random bonus. Weapons: refine ATK added after DEF, overupgrade as a random part of the damage range (enumerated for the exact average); armor: refine DEF (rounded as rAthena does). Verify against `battle_calc_base_damage`, `pc_rightside_atk`, `status_calc_pc` | Maintainer: same as rAthena. |
| Shields | A shield in `leftHand` adds its ASPD penalty (verify where pre-re takes it from: `job_aspd.yml` and `status_base_amotion_pc`; add it to `jobs.json` if missing) and its DEF | Phase 3 left this to phase 4. |
| Dual wield | Assassin with two weapons: right hand and left hand damage computed separately with pre-re's dual wield rules (`battle_calc_weapon_attack`, `ATK_RATER`/`ATK_RATEL` with mastery 0 until phase 5), dual wield ASPD (`status_base_amotion_pc`), both hits shown; DPS sums both. Katar stays right hand only | Phase 3 left this to phase 4. |
| Weapon element | From the weapon's `bAtkEle` effect; otherwise neutral. The element table lookup from phase 3 takes this element | The most common script effect that changes auto attack. |
| ASPD cap | ccRO items that raise the cap above 190: the maintainer names them and their new cap in task 7; the engine takes the cap as `max(config.maxAspd, item caps)` through a ccRO bonus name `bMaxAspd` that only appears in `data-overrides` | Phase 3 kept the cap in config for this; rAthena has no such bonus, so it is ccRO-specific and marked as such. |
| Hidden items | The maintainer's review moves from `docs/hidden-items-review.yml` to `data-overrides/hidden-items.yml` (same content). The pipeline sets `hidden: true` on items with `hide: true`. Search leaves them out unless "show hidden items" is ticked; a hidden item already in a build still loads, with no warning | A data decision belongs in the override layer; old builds keep working. |
| Equipment search | Per slot, the phase 3 search narrowed to items whose `locations` fit the slot and the job and level can equip; same matching and 50-result limit | Reuses phase 3's search. |
| Build model | `v: 2`: `weapon` is replaced by `equipment: Partial<Record<Slot, { item, refine }>>`. `normalizeBuild` accepts v1 and migrates `weapon` into `equipment.rightHand` with refine 0, without a warning. Equipment that the job or level cannot equip is kept but shown as an error (like an over-budget stat total), not dropped | Phase 3 links are live; maintainer chose to keep them decoding. Lowering the level must not destroy gear. |
| Share code | Format version stays 1; tag 10 (weapon) still decodes into `rightHand`. New tag 14, repeated: one equipped item as varint slot index (order of the slot list above, only appended to), item id, refine. Encoding writes tag 14 for every slot (also `rightHand`) and no longer writes tag 10 | Adding tags is what the phase 3 format allows; old links decode unchanged. |
| Saved build | Saved JSON becomes v2; v1 JSON in `localStorage` is migrated on load | Same as share codes. |

## Design

### Files
```
data-pipeline/
  script/lexer.ts        rAthena script tokens
  script/parser.ts       subset grammar -> Effect AST, or an unsupported reason
  script/constants.ts    rAthena constants the subset needs (from src/map/script_constants.hpp)
  script/*.test.ts       one case per grammar rule plus real scripts from item_db_equip.yml
  refine.ts              refine.yml -> tables.refine
  coverage.ts            docs/script-coverage.md
  items.ts               adds effects, hidden
data-overrides/
  hidden-items.yml       moved from docs/hidden-items-review.yml
src/data/types.ts        Effect AST types, Item.effects/hidden, tables.refine
src/engine/
  effects.ts             evaluate an item's AST with a context -> bonus calls
  bonuses.ts             BonusSet: sums bonus calls; COMPUTED_BONUSES; labels for "not modelled"
  equipment.ts           slot rules, refine ATK/DEF, shield, dual wield helpers
  status.ts, autoAttack.ts  take the BonusSet, refine, weapon element, left hand
src/build/
  model.ts               v2, equipment, v1 migration
  shareCode.ts           tag 14
  search.ts              per-slot search, hidden filter
src/app/
  EquipmentPanel.svelte  slots, per-slot search, refine input, "not modelled" notes
```

### Effect AST (shape; final names may differ)
```ts
type Expr =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'var'; name: string }
  | { k: 'call'; fn: 'getrefine' | 'readparam' | 'getskilllv' | 'eaclass'; args: Expr[] }
  | { k: 'ref'; name: 'BaseLevel' | 'JobLevel' | 'BaseJob' | 'Class' }
  | { k: 'op'; op: string; args: Expr[] };
type Stmt =
  | { k: 'bonus'; name: string; args: Expr[] }        // name e.g. 'bAddRace'
  | { k: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] }
  | { k: 'set'; name: string; value: Expr };
interface Item { /* phase 2 fields */ effects: Stmt[] | null; unsupported?: string; hidden?: true; }
```
Constants are resolved to numbers or rAthena names at parse time, so the
engine never needs `script_constants.hpp`.

## Acceptance criteria
- [ ] Every equipment slot can be filled through search, with refine where
      the item allows it; overlapping headgear and two-handed weapons clear
      the slots they cover.
- [ ] The status window and auto attack results change with item stat
      bonuses, refine ATK/DEF, weapon element, race/element/size/class
      damage bonuses, ignore-DEF effects, ASPD bonuses and shield penalty,
      each covered by an engine test that cites the rAthena line it follows.
- [ ] An Assassin with two daggers shows right and left hand damage and a
      DPS that includes both.
- [ ] `docs/script-coverage.md` is regenerated by `pnpm data`; at least 90 %
      of equipment scripts parse (the rest are listed with reasons).
- [ ] An item with an unsupported script or a stored-only bonus shows a
      "not modelled" note in the UI.
- [ ] Items with `hide: true` are not offered in search unless "show hidden
      items" is ticked; a build that already uses one still loads.
- [ ] A phase 3 share link and a phase 3 saved build open with the weapon in
      the right hand and the same numbers as before.
- [ ] A build with full gear round-trips through a share code and through
      `localStorage` unchanged.

## Verification
```
pnpm data && git diff --exit-code src/data/generated docs/script-coverage.md
pnpm check && pnpm lint && pnpm test && pnpm build
```
Formula correctness for gear is confirmed by the maintainer in the phase 4b
validation session. Clicking through the equipment panel in the deployed
app is the maintainer's step.

## Tasks
1. [x] **Hidden items.** Move the review file to
   `data-overrides/hidden-items.yml`, pipeline sets `hidden`, search filter
   and "show hidden items" toggle. Check: pipeline and search tests.
2. [x] **Script parser.** Lexer, parser, constants for the subset above;
   unsupported reasons. Tests per grammar rule plus 20 real scripts
   (plain, refine-conditional, job-conditional, unsupported).
3. [x] **Effects in the data.** `items.json` gains `effects`/`unsupported`;
   `docs/script-coverage.md` generator. Check: `pnpm data`, coverage ≥ 90 %,
   tests. Report the top unsupported reasons in the progress log.
4. [x] **Effect evaluation and BonusSet.** `effects.ts`, `bonuses.ts` with the
   computed list and labels. Check: engine tests with hand-made ASTs.
5. [x] **Refine tables.** `refine.yml` into `tables.refine`; refine ATK
   (incl. overupgrade in the exact average) and DEF in the engine. Check:
   hand-computed tests.
6. [ ] **Engine uses gear.** Status window and auto attack take equipment
   bonuses, weapon element, ignore DEF, race/ele/size/class modifiers in
   the pre-re order of `battle_calc_weapon_attack`. Check: tests, phase 3
   fixtures unchanged.
7. [ ] **Shields, dual wield, ASPD cap.** Shield ASPD penalty and DEF, Assassin
   left hand, `bMaxAspd` (ask the maintainer for the ccRO items and caps
   before writing the override). Check: tests.
8. [ ] **Build model v2 and share code tag 14.** Equipment, v1 migration,
   saved-build migration, slot rules in normalize. Check: tests including a
   recorded phase 3 code and phase 3 saved JSON.
9. [ ] **Equipment panel.** Slots, per-slot search, refine, "not modelled"
   notes, results summary line. Check: component tests and `pnpm build`.
10. [ ] **Hand fixes.** Rewrite the scripts of the most-used unsupported
    items the maintainer picks from the coverage report as overrides.
    Check: coverage report shows them as parsed.
11. [ ] **Review.** Run `/code-review` on the phase diff, fix findings, run
    the full verification.

## Progress log
<!-- implement skill appends: date · task · result · commit -->
- 2026-11-13 · setup · baseline green (check, lint, 215 tests, build); `pnpm data` drift check treats `generatedAt` in `meta.json` as expected, as the pipeline README says · 5340639
- 2026-11-13 · 1 hidden items · 883 items hidden; pipeline loader + unknown-id check, search filter, "Show hidden items" toggle in the weapon picker; check, lint, 222 tests pass · 9cdd5ef
- 2026-11-13 · 2 script parser · lexer, precedence-climbing parser (rAthena `parse_subexpr` levels), 465 constants + 242 bonus names extracted from rAthena 7f080871c by `script/extract-constants.ts`; 45 tests incl. 20 real scripts pass; 92.7 % of the 1,266 equipment scripts parse. Subset additions over the plan, all seen in real scripts: `min`/`max`/`pow`, `BaseClass`, `?:`, empty statements; bonus value counts checked per command (rAthena dispatches by count, a missing value is 0) · b2da991
- 2026-11-13 · 3 effects in the data · `pnpm data`: 1,175 of 1,267 scripts parse (92.7 %; 95.4 % of not-hidden items); report guarded by `coverageHash` in `meta.json` (checked in `data.test.ts`) rather than the data hash, so share codes don't depend on a doc. Top unsupported reasons: `command "skill"` 63, `command "autobonus"` 22, then one each for `getequiprefinerycnt`, `gettime`, `strcharinfo`, `vip_status`, `IG_Jewel`, `IG_Ore`, `IG_Potion`. Note for task 10: the `skill` items include elemental weapons (e.g. 1131 Ice Falchion, 1133 Fireblend), whose `bAtkEle` is lost with the rest of the script. `items.json` 627 → 1,232 kB; bundle 1,014 → 1,307 kB (gzip 129 → 150 kB). check, lint, 273 tests, build pass · 5abf9f0
- 2026-11-13 · 4 effect evaluation and BonusSet · `effects.ts` evaluator (op_2num integer semantics, every operand evaluated as rAthena does, runtime error ends the script keeping earlier bonuses) and `bonuses.ts` (`BonusSet` keyed by name, key values and `lr_flag` source; `COMPUTED_BONUSES` as `name/arity`; labels for every bonus in the data). Deviations from the plan, checked in rAthena: `readparam(bStr)` returns `sd->status.str`, the raised stat without job bonus or equipment (`pc_readparam`; `bStr` is a constant, not a parameter), not "after base + job bonus"; `bAtkRate` dropped from the computed list because pre-renewal `pc_bonus` rejects it; bonuses are routed by source because `pc_bonus2` sends bAddRace/Ele/Size/Class from a dual-wielded left weapon to `left_weapon` and from a shield to `right_weapon`, while bIgnoreDefRace/Class and bDefRatioAtk* take only `LR_FLAG_NONE` and the left weapon. Coverage report now marks computed vs stored-only bonuses (36 of 113 computed). check, lint, 297 tests pass · 21b500d
- 2026-11-13 · 5 refine tables · `tables.refine` from pre-re `refine.yml` (Armor level 1, Weapon levels 1–4, ×100 units as rAthena stores them); `equipment.ts` `weaponRefine` (atk2 = Bonus/100, overrefine = RandomBonus/100) and `armorRefineDef` ((sum + 50)/100, `status_calc_pc`); auto attack adds overupgrade 1..n after base ATK (`battle_add_weapon_damage`, crits too) and refine ATK after DEF before the floor of 1 (`battle_calc_attack_post_defense`); status window right ATK = `rhw.atk2` (pre-re `pc_rightside_atk`). `CharacterInput` carries the resolved `weaponRefine`; builds pass +0 until the v2 model. check, lint, 309 tests pass, phase 3 fixtures unchanged · 9aa6617
- 2026-11-13 · session end before task 6 · open questions for the maintainer: (a) bMaxHP/bMaxSP(rate) are in the computed list, but the status window shows no HP/SP and jobs.json has no HP/SP tables, so computing them means adding HP/SP to the status window and the pipeline: do it in 4a or move them to stored-only? (b) task 7: which ccRO items raise the ASPD cap, and to what? (c) 63 items fail only on `skill "X",n;` (granted skill), including elemental weapons whose `bAtkEle` is lost: keep them unsupported and fix by hand in task 10, or parse `skill` as a stored-only effect? · –
