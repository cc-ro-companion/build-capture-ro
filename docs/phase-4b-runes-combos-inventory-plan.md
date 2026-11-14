# Phase 4b: Runes, combos and inventory — plan

Status: approved

Parent: [build-planner-plan.md](build-planner-plan.md), phase 4, second half.
Needs phase 4a ([phase-4a-equipment-scripts-plan.md](plans/archive/phase-4a-equipment-scripts-plan.md)):
its script parser, effect AST, `BonusSet`, equipment slots and build model v2.

## Goal
Equipped items take ccRO runes in their card slots, and rune effects
count in the results. Rune sets and rAthena item combos apply when
everything they need is equipped. Each build keeps an inventory of
configured items (item, refine, runes), so the user can swap between
setups without configuring them again. The phase ends with the
validation session for all of phase 4 at ccRO's training dummy, recorded
as fixtures.

## Out of scope
- Vanilla rAthena cards: ccRO uses runes only (maintainer).
- The card album and the rune effects it unlocks (grey `[+X Card]`
  conditions in the client text): phase 8. Those effects are entered and
  stored now but never applied; the UI lists them as "needs card album
  (phase 8)".
- Rune or combo effects that the engine does not compute in 4a (skills,
  autocast, drops, healing, cast time…): stored, shown as "not
  modelled", computed in later phases.
- Named build lists, import/export: phase 10. "What if" previews when
  hovering an inventory item: phase 10.

## Decisions
| Decision | Choice | Reason |
| --- | --- | --- |
| Rune source | The game client's item info (`docs/reference/itemInfo_orig.lua`, gitignored, maintainer's copy): the 235 items named "… Rune" in the 39xxx range (first one 39101 Anacondaq Rune). `docs/reference/cc-ro-runes_raw.json` from ccRO's rune database is a cross-check only | The client file has the real ids; ids are what builds store. |
| Rune ids | The client item ids (39101…), used in builds and share codes | Ids never change (idea file). |
| Rune data format | `data-overrides/runes.yml`, hand-maintained, one entry per rune: `Id`, `Name`, `Location` (Weapon, Shield, Armor, Garment, Footgear, Accessory, Headgear), `Script` (rAthena script, parsed by the 4a parser), `Sets` (rune set bonuses, see below), `Album` (list of `{ Requires: [card names], RightHandOnly?: true, Note?, Script }`), `Source` (the original client lines as a comment block). The pipeline writes `runes.json` | Maintainer's choice: rune effects are rewritten in rAthena script so one parser serves items and runes. Album conditions are structured data, not script, because rAthena has nothing like them. |
| Plain conditions | Class conditions (`[Swordman Class]`) become `if (eaclass()&EAJ_…)` or `BaseJob` in `Script`; refine conditions use `getrefine()` (the refine of the item the rune sits in, as rAthena does for cards); base stat conditions use `readparam(bX)` | All within the 4a subset. |
| Drafting `runes.yml` | A one-off script `data-pipeline/tools/draft-runes.ts <itemInfo path>` reads the 235 runes, maps common phrases to rAthena bonuses ("STR + 1" → `bonus bStr,1;`, "Increase damage on X Property monster by N%" → `bonus2 bAddEle,Ele_X,N;`, "Critical Rate + N on X monster" → `bonus2 bCriticalAddRace,RC_X,N;`, …), and writes each line it cannot map as `# TODO: <text>` in that rune's `Script`. The maintainer reviews every rune and resolves the TODOs; the tool is not part of `pnpm data` | 235 runes is a lot to type by hand; review is still needed because the client text is the only source and phrasing varies. |
| Unreviewed runes | Each entry has `Reviewed: true\|false`; the draft writes `false`. The pipeline fails if a reviewed rune still has a `TODO`; drafts keep their TODO lines out of the parsed effects. Unreviewed runes are offered in search with a "draft" badge | Runes can ship before all 235 are reviewed, without passing a guess off as checked data. |
| Rune slots | An equipped item takes up to `slots` runes; a rune fits only if its `Location` matches the slot: Weapon → `rightHand` or a `leftHand` weapon, Shield → `leftHand` shield, Armor → `armor`, Garment → `garment`, Footgear → `shoes`, Accessory → both accessory slots, Headgear → any head slot. The same rune may be used more than once | Maintainer: runes go into normal card slots, like cards in vanilla RO. |
| Rune effect context | A rune's script runs with the context of the item it sits in (that item's refine for `getrefine()`) | Matches rAthena's card handling. |
| Rune sets | Plain `[+ A, B, C & D Rune]` conditions: `Sets: [{ Requires: [rune ids], Script }]` on one rune (the one whose text lists it). The set applies once when every required rune is equipped anywhere, each counted once, and the rune holding the set is equipped too | Mirrors rAthena combos; one owner avoids applying a set several times. |
| Item combos | rAthena `db/pre-re/item_combos.yml` into `combos.json` (item ids + parsed script). Combos that include any non-equipment item (cards) are dropped, since cards do not exist on ccRO. A combo applies once when all its items are equipped; its effects go through the same `BonusSet`. ccRO changes go in `data-overrides/combos.yml` (keyed by the sorted item id list) | Combos are in the master plan's phase 4; rAthena is the default until the maintainer says otherwise. |
| Right-Hand only | `RightHandOnly` album effects apply only when the rune sits in the `rightHand` item; stored in 4b, used once the album exists | The client text marks it; the field is cheap to keep now. |
| Inventory | Per build, a list of up to 50 configured items `{ item, refine, runes: id[] }`. "Store" copies an equipped item into the inventory; "Equip" copies an inventory item into a fitting slot (replacing what is there). Equipped items stay stored by value as in 4a | Copy semantics leave the 4a model untouched and make the inventory optional. PoB-style quick swapping. |
| Build model | Stays `v: 2`: each equipped item gains `runes: id[]` and the build gains `inventory`; both default to empty when missing, so 4a builds load unchanged. Unknown rune ids are dropped with a warning; runes that do not fit the item's location, or more than its slots, are kept but shown as an error | Optional fields need no migration; lowering slots by a data change must not silently destroy a build. |
| Share code | New tag 15, repeated: runes of one equipped item as varint slot index, varint count, rune ids. New tag 16, repeated in list order: one inventory item as varint item id, refine, count, rune ids. Rune ids are stored as `id − 39000` to save bytes | Additive tags keep 4a links decoding. |
| Results display | The build panel shows applied set and combo bonuses by name; "not modelled" notes from 4a also cover runes, sets and combos; album effects are listed apart as "needs card album (phase 8)" | The user sees why a number did or did not change. |
| Validation | One session at the end of 4b for all of phase 4, recorded as fixtures in `tests/fixtures/auto-attack/`: at least refined weapon and armor, a stat item, a shield, an Assassin dual wielding, a weapon with `bAtkEle`, a race/size damage rune, and an active combo or rune set. The fixture format gains `equipment` (and `inventory` is not needed). Deviations found are fixed in the engine or recorded as ccRO overrides with the session as source | Maintainer's choice: one session for phase 4. |

## Design

### Files
```
data-overrides/
  runes.yml              hand-maintained runes (drafted once by the tool)
  combos.yml             ccRO combo differences (empty at first)
data-pipeline/
  runes.ts               runes.yml -> runes.json (parse Script, Sets, Album; fail on TODO)
  combos.ts              item_combos.yml + overrides -> combos.json
  tools/draft-runes.ts   one-off draft from the client item info
src/data/types.ts        Rune, RuneSet, AlbumEffect, Combo
src/engine/
  equipment.ts           rune slot rules
  effects.ts             rune context; active sets and combos
src/build/
  model.ts               runes per equipped item, inventory
  shareCode.ts           tags 15 and 16
  search.ts              rune search per slot location
src/app/
  EquipmentPanel.svelte  rune slots per item, draft badge, set/combo notes
  InventoryPanel.svelte  list, store, equip, remove
tests/fixtures/auto-attack/   phase 4 validation fixtures
```

### Data shapes (final names may differ)
```ts
interface Rune {
  id: number; name: string;
  location: 'Weapon' | 'Shield' | 'Armor' | 'Garment' | 'Footgear' | 'Accessory' | 'Headgear';
  effects: Stmt[];                 // 4a AST
  sets: { requires: number[]; effects: Stmt[] }[];
  album: { requires: string[]; rightHandOnly: boolean; note?: string; effects: Stmt[] }[];
  reviewed: boolean;
}
interface Combo { items: number[]; effects: Stmt[] | null; unsupported?: string }
interface EquippedItem { item: number; refine: number; runes: number[] }
```

## Acceptance criteria
- [ ] All 235 runes are in `runes.json` with the client ids; none contains a
      `TODO`.
- [ ] A rune can be put into a fitting slot of an equipped item, up to the
      item's slot count; a rune of the wrong location is not offered.
- [ ] Rune effects, active rune sets and active item combos change the
      status window and auto attack results; each kind has an engine test.
- [ ] Album effects are stored and shown as "needs card album (phase 8)",
      and never change a number.
- [ ] The inventory holds configured items; store and equip round-trip an
      item with refine and runes unchanged.
- [ ] A 4a share link and saved build open unchanged; a build with runes and
      inventory round-trips through a share code and `localStorage`.
- [ ] The phase 4 validation fixtures pass in `pnpm test`.

## Verification
```
pnpm data && git diff --exit-code src/data/generated docs/script-coverage.md
pnpm check && pnpm lint && pnpm test && pnpm build
```
The validation session at the training dummy is the maintainer's step; its
results become fixtures that `pnpm test` then guards.

## Tasks
1. [x] **Draft tool.** `draft-runes.ts` with phrase mappings and TODO lines;
   run it on the maintainer's client file and commit the draft
   `runes.yml`. Check: tool tests on sample client entries; report the
   TODO count in the progress log.
2. [x] **Rune pipeline.** `runes.ts`, types, fail on TODO only for
   `Reviewed: true` entries (drafts are allowed while review runs).
   Check: pipeline tests, `pnpm data`.
3. [ ] **Maintainer review.** The maintainer resolves TODOs and sets
   `Reviewed: true`. Can run in parallel with tasks 4–8. Check: no TODO
   left; pipeline then fails on any TODO.
4. [x] **Combos.** `combos.ts`, card combos dropped, override file. Check:
   pipeline tests; combo count in the progress log.
5. [x] **Engine: runes, sets, combos.** Rune context, slot rules, active
   set and combo detection, album effects ignored. Check: engine tests.
6. [ ] **Build model and share code.** Runes per item, inventory, tags 15
   and 16. Check: tests including a recorded 4a code.
7. [ ] **UI.** Rune slots and rune search, draft badge, set/combo/album
   notes, inventory panel. Check: component tests, `pnpm build`.
8. [ ] **Review.** Run `/code-review` on the phase diff, fix findings, run
   the full verification.
9. [ ] **Validation session.** The maintainer records the characters listed
   under Decisions; fixtures added; deviations fixed or recorded as
   overrides. Check: `pnpm test` with the new fixtures.

## Progress log
<!-- implement skill appends: date · task · result · commit -->
- 2026-11-14 · Task 1 draft tool · vitest data-pipeline/tools 39 passed, lint clean; 235 runes, 95 TODO lines, all 365 scripts parse without them · cbeb4d2
- 2026-11-14 · Task 2 rune pipeline · pnpm data: Runes 235 (235 not reviewed); check 0 errors, lint clean, test 464 passed (fixes the overrides-hash test that task 1's new runes.yml broke) · a203d4d
- 2026-11-14 · Task 4 combos · pnpm data: Combos 81 kept, 75 dropped (35 with cards, 5 with arrows, 35 with rebirth-only gear), 9 not parsed (getequiprefinerycnt); check 0 errors, lint clean, test 477 passed · 4cefb6e
- 2026-11-14 · Task 5 engine · runes.test.ts 29 passed (slot rules, host refine, left-hand source, order, album ignored, sets, combos, status window and auto attack); full: check 0 errors, lint clean, test 506 passed · cb7a7a2
