# runes.yml TODO review

Review of the 95 `# TODO:` lines in `data-overrides/runes.yml` (phase 4b,
task 3), with a proposed script for each. Sources: the client text, rAthena's
vanilla card scripts (`db/pre-re/item_db_etc.yml`) and combos
(`db/pre-re/item_combos.yml`). Item ids were checked against the client's
`itemInfo_orig.lua`. Nothing was looked up on ratemyserver.

**Status (2026-11-14): done.** S1, S2 and all rows are applied; every rune
is `Reviewed: true`. The maintainer's answers: Kasa 5% each; Flame Skull 5%
each; Merman Coma 1%; Hylozoist 1%; Isilla and Vanberk as vanilla; drop rows
as proposed; "no rAthena bonus" rows and the album exceptions go into the
new `Unmodelled` field (D1). Poison ticks (Giant Spider, Snake) and
self-healing (Enchanted Peach Tree) are deferred tasks in
[build-planner-plan.md](build-planner-plan.md). S1 covered 11 runes, not 12.

Markers: **✓** = the client text maps cleanly (usually to the vanilla card
script). **?** = needs your decision (there is a question). **–** = no rAthena
bonus exists; keep it as a comment.

## Decisions that apply to many items

**D1. Effects with no rAthena bonus.** The script lexer skips `//` comments,
so `// not modelled: <client text>` clears a TODO without blocking
`Reviewed: true`. Downside: a comment never shows up in the planner's "not
modelled" notes. If you want those effects visible to users, I'd add an
optional `Unmodelled: [text, ...]` list per rune (and per set and album
entry) that the notes show. That is a small change in `runes.ts` and
`notModelled.ts`. **Recommendation:** add `Unmodelled`. The comment works too
if you'd rather not.

**D2. "Chance increased to X%".** Album or set text that raises an existing
chance becomes a second bonus carrying the difference. For example, 6% → 12%
is a second `bonus2 bAddEffWhenHit,…,600;`. rAthena adds the rates of
identical `bAddEffWhenHit` entries. Two `bAutoSpell` entries each roll
separately, which is near-additive at these small chances.

**D3. Missing numbers.** Where the client says "a chance" without a number,
I use the vanilla card's value and mark it **?**. Those values are rAthena's,
not confirmed for ccRO.

**D4. Unequip effects** (`-50 SP when unequipped`, `Drain 100 SP as the armor
is unequipped`). rAthena puts these in `UnEquipScript`, which runes.yml has no
field for, and a planner never unequips anything. Treat them as D1.

## Structural finding (not a TODO, but more important)

**S1. The class bonus after a rune set belongs to the set.** The draft scopes
each `[...]` header up to the next header, so in text like

```
[+ Cruiser, Anolian, Alligator & Dragon Tail Rune]
  …set lines…
[+Wormtail Card]          (grey, album)
  All stats + 1, MATK + 15
[Archer Class]
  Receive 5% more EXP from Brute…
```

the `[Archer Class]` lines ended up in the rune's own `Script`. rAthena's
vanilla combos put that class part *inside* the combo:

- Merman: `if (BaseClass == Job_Archer) { bExpAddRace…; bComaRace… }`
- Loli Ruri: Mage MATK +3% and cast time −15%
- Waste Stove: Monk
- Archdam: Crusader
- Hylozoist and Holden: Merchant / Alchemist drops

As drafted, these class bonuses apply **without** the set.
**Recommendation:** move the class block into the set's `Script` for these 12
runes:

| Rune | Class block |
| --- | --- |
| 39105 Assaulter | Swordman |
| 39211 The Paper | Thief |
| 39266 Archdam | Crusader |
| 39291 Geographer | Acolyte |
| 39303 Loli Ruri | Mage |
| 39339 Waste Stove | Monk |
| 39342 Yellow Novus | Sage |
| 39406 Merman | Archer |
| 39446 Hylozoist | Merchant |
| 39488 Wickebine Tres | Rogue |
| 39514 Holden | Alchemist |

Lude (39453) and Quve (39470) are correct as drafted: their
`[Novice, Super Novice]` comes before the set, as in the vanilla Lude Card.
Runes with a class line but no set (Fur Seal, Wanderer, Wild Rose, Zipper
Bear, Baby Leopard, …) are fine too. Several TODOs below sit in these class
blocks; the scripts below are written for the set after the move.

**S2. "Seal Rune" is Fur Seal Rune (39143).** rAthena's vanilla combo lists
`Fur_Seal_Card`, whose display name is "Seal Card". Add `39143` to the
`Requires` lists of Geographer (39291) and Waste Stove (39339), and delete the
two "unknown rune" TODOs. ✓

## Scripts that change numbers

| Rune | TODO | Proposed script | |
| --- | --- | --- | --- |
| 39221 Bapho Jr. | AGI + 3, Critical Rate + 1% | `bonus bAgi,3; bonus bCritical,1;` (vanilla card; the client writes CRIT with "%") | ✓ |
| 39231 Green Maiden | LUK and Critical Rate + 1% per refine | keep `bonus bLuk,-5;`, add `bonus bLuk,getrefine(); bonus bCritical,getrefine();` (vanilla: `bLuk,getrefine()-5`) | ✓ |
| 39295 Goat | refined to +5 or below: DEF +2, MDEF +5 | `if (getrefine() <= 5) { bonus bDef,2; bonus bMdef,5; }` | ✓ |
| 39405 Megalith | footgear +5 or lower: MDEF +7 | `if (getrefine() <= 5) bonus bMdef,7;` | ✓ |
| 39517 Kathryne Keyron | cast time −1% per refine | `bonus bCastrate,-getrefine();` | ✓ |
| 39285 Earth Deleter | natural SP recovery −100% | `bonus bSPrecovRate,-100;` (the unequip line: D4) | ✓ |
| 39330 Sky Deleter | natural HP recovery −100% | `bonus bHPrecovRate,-100;` | ✓ |
| 39303 Loli Ruri (set) | +10% Fire, Cold and Lightning Bolt | `bonus2 bSkillAtk,"MG_FIREBOLT",10; bonus2 bSkillAtk,"MG_COLDBOLT",10; bonus2 bSkillAtk,"MG_LIGHTNINGBOLT",10;` (vanilla combo) | ✓ |
| 39448 Imp | Fire Bolt cast −25%, damage +25% | `bonus2 bSkillAtk,"MG_FIREBOLT",25; bonus2 bCastrate,"MG_FIREBOLT",-25;` | ✓ |
| 39476 Siroma | same for Cold Bolt | `bonus2 bSkillAtk,"MG_COLDBOLT",25; bonus2 bCastrate,"MG_COLDBOLT",-25;` | ✓ |
| 39345 Ancient Mummy (set) | Perfect Hit + 20 | `bonus bPerfectHitAddRate,20;` (vanilla Mummy combo) | ✓ |
| 39406 Merman (set) | Perfect Hit + 20% | `bonus bPerfectHitAddRate,20;` (vanilla combo) | ✓ |
| 39133 Drosera | Critical Rate + 15 with ranged attacks | `bonus bCriticalLong,15;` (vanilla). The engine doesn't compute `bCriticalLong` yet, so this changes bow crit only once it does; worth a follow-up | ✓ |
| 39200 Sidewinder | Double Attack 5% chance | `bonus bDoubleRate,5;`. The vanilla card grants `skill "TF_DOUBLE",1` (daggers only); the album line "if on a dagger" suggests the base works with any weapon | ? |

## Autocasts and status chances

| Rune | TODO | Proposed script | |
| --- | --- | --- | --- |
| 39248 Punk | Lv 5 if Quagmire is mastered | replace the drafted line with the vanilla `bonus4 bAutoSpellWhenHit,"WZ_QUAGMIRE",1+4*(getskilllv("WZ_QUAGMIRE") == 5),50,0;` | ✓ |
| 39263 Anolian | Lv 10 if mastered | `bonus3 bAutoSpellWhenHit,"AC_CONCENTRATION",1+9*(getskilllv("AC_CONCENTRATION") == 10),30;` | ✓ |
| 39275 Clock | Lv 10 if mastered | `bonus3 bAutoSpellWhenHit,"CR_AUTOGUARD",3+7*(getskilllv("CR_AUTOGUARD") == 10),30;` | ✓ |
| 39291 Geographer | Lv 10 if mastered | `bonus3 bAutoSpellWhenHit,"AL_BLESSING",2+8*(getskilllv("AL_BLESSING") == 10),30;` | ✓ |
| 39352 Enchanted Peach Tree | Lv 10 if mastered | `bonus3 bAutoSpell,"AL_HEAL",1+9*(getskilllv("AL_HEAL") == 10),20;` | ✓ |
| 39488 Wickebine Tres (set) | 5% Strip Armor Lv 5 if mastered | `if (getskilllv("RG_STRIPARMOR") == 5) bonus3 bAutoSpell,"RG_STRIPARMOR",5,50;` | ✓ |
| 39237 Kasa | 5% Fire Bolt or Fire Ball Lv 5 | `bonus3 bAutoSpell,"MG_FIREBOLT",5,25; bonus3 bAutoSpell,"MG_FIREBALL",5,25;` (5% total). The vanilla card has 2% each (`20`). Is it 5% total or 5% each? | ? |
| 39438 Greatest General | Acolyte: chance increased to 2% | replace the drafted line and block with the vanilla `bonus3 bAutoSpell,"MO_CALLSPIRITS",5,2+18*(BaseClass == Job_Acolyte);` | ✓ |
| 39463 Owl Duke (set) | Impositio Manus chance increased to 1.0% | `bonus3 bAutoSpell,"PR_IMPOSITIO",3,7;` (adds 0.7% to the base 0.3%, D2) | ✓ |
| 39272 Brilight | 6% Silence when hit | `bonus2 bAddEffWhenHit,Eff_Silence,600;` (vanilla) | ✓ |
| 39279 Dark Frame | 6% Stone Curse when hit | `bonus2 bAddEffWhenHit,Eff_Stone,600;` | ✓ |
| 39280 Demon Pungus | 6% Sleep when hit | `bonus2 bAddEffWhenHit,Eff_Sleep,600;` | ✓ |
| 39293 Giant Spider | 6% Poison when hit | `bonus2 bAddEffWhenHit,Eff_Poison,600;` | ✓ |
| 39301 Kraben | 6% Blind when hit | `bonus2 bAddEffWhenHit,Eff_Blind,600;` | ✓ |
| 39304 Majoruros | 6% Stun when hit | `bonus2 bAddEffWhenHit,Eff_Stun,600;` | ✓ |
| 39354 Flame Skull | Stun, Curse, Blind, Stone Curse when hit, no % given | `bonus2 bAddEffWhenHit,Eff_Stun,500;` and the same for `Eff_Curse`, `Eff_Blind`, `Eff_Stone` (vanilla 5% each, D3) | ? |
| 39442 Hell Poodle | 1% Bleeding with short-range attacks | `bonus3 bAddEff,Eff_Bleeding,100,ATF_SHORT;`. The client says 1%; vanilla has 0.5% (`50`) | ✓ |
| 39406 Merman (set, Archer) | Coma on Brute when attacking, no % given | `bonus2 bComaRace,RC_Brute,100;` (vanilla 1%, D3) | ? |
| 39446 Hylozoist | transform a monster while fighting | `bonus bClassChange,100;` (vanilla 1%, D3) | ? |
| 39516 Isilla | per magic cast: cast −50%, FLEE +30 for 5 s | vanilla `autobonus "{ bonus bCastrate,-50; bonus bFlee,30; }",50,5000,BF_MAGIC,"{ specialeffect2 EF_SUFFRAGIUM; }";` (5% chance, D3) | ? |
| 39539 Vanberk | per attack: CRIT +100 for 5 s | vanilla `autobonus "{ bonus bCritical,100; }",5,5000,0,"{ specialeffect2 EF_ENHANCE; }";` (0.5% chance, D3) | ? |
| 39482 Stapo | enables Pick Stone and Throw Stone Lv 1 | `skill "TF_PICKSTONE",1; skill "TF_THROWSTONE",1;` | ✓ |

## Drops and item healing (parsed, shown as not modelled)

Item ids checked against the client file.

| Rune | Proposed script | |
| --- | --- | --- |
| 39105 Assaulter (set) — 5% Red Potion | `bonus2 bAddMonsterDropItem,501,500;` | ✓ |
| 39105 Assaulter (set, Swordman) — potions +50% HP | `bonus2 bAddItemHealRate,501,50; bonus2 bAddItemHealRate,503,50; bonus2 bAddItemHealRate,504,50;` | ✓ |
| 39342 Yellow Novus (set, Sage) — 1% Red or Yellow Gemstone | `bonus2 bAddMonsterDropItem,716,100; bonus2 bAddMonsterDropItem,715,100;` | ✓ |
| 39446 Hylozoist (set, Merchant) — Old Purple Box | `bonus2 bAddMonsterDropItem,617,5;` (vanilla 0.05%, D3) | ? |
| 39514 Holden (set, Alchemist) — Glistening Coat or Stem | `bonus2 bAddMonsterDropItem,7139,3; bonus2 bAddMonsterDropItem,905,10;` (vanilla, D3) | ? |
| 39420 Anopheles — Tentacle Cheese Gratin from Insect | `bonus3 bAddMonsterDropItem,12058,RC_Insect,50;` (vanilla, D3) | ? |
| 39421 Armeyer Dinze — Clam Soup from Fish | `bonus3 bAddMonsterDropItem,12053,RC_Fish,50;` | ? |
| 39422 Baroness of Retribution — Fried Sweet Potato from Angel | `bonus3 bAddMonsterDropItem,12068,RC_Angel,50;` | ? |
| 39431 Dragon Egg — Honey Herbal Tea from Dragon | `bonus3 bAddMonsterDropItem,12048,RC_Dragon,50;` | ? |
| 39439 Gremlin — Bomber Steak from Brute | `bonus3 bAddMonsterDropItem,12043,RC_Brute,50;` | ? |
| 39440 Grove — Fruit Mix from Formless | `bonus3 bAddMonsterDropItem,12063,RC_Formless,50;` | ? |
| 39436 Gargoyle — 1% Box of Thunder from Insect | `bonus3 bAddMonsterDropItem,12028,RC_Insect,100;` | ✓ |
| 39460 Orc Archer — 1% Box of Panting from DemiHuman | `bonus3 bAddMonsterDropItem,12034,RC_DemiHuman,100;` | ✓ |
| 39472 Raydric Archer — 1% Box of Resentment from Demon | `bonus3 bAddMonsterDropItem,12030,RC_Demon,100;` | ✓ |
| 39477 Sleeper — 1% Box of Drowsiness from Fish | `bonus3 bAddMonsterDropItem,12031,RC_Fish,100;` | ✓ |
| 39528 Myst Case — Gift Box | `bonus2 bAddMonsterDropItem,644,30;` (vanilla 0.3%, D3) | ? |
| 39479 Snowier — "low chance" of Ice Cream | `bonus2 bAddMonsterDropItem,536,2000;` (vanilla 20%, which is hardly "low", D3) | ? |
| 39479 Snowier — Ice Cream recovery +100% | `bonus2 bAddItemHealRate,536,100;` | ✓ |
| 39442 Hell Poodle — Meat recovery +100% | `bonus2 bAddItemHealRate,517,100;` | ✓ |

## No rAthena bonus: keep as a comment (D1)

| Rune | TODO | Note |
| --- | --- | --- |
| 39122 Death Word, 39152 Hill Wind, 39163 Laurell Weinder, 39188 Pitman, 39191 Red Ferus | −50 SP when unequipped | D4 |
| 39285 Earth Deleter | drain 100 SP when unequipped | D4 |
| 39211 The Paper (set) | Intimidate autocast will not function | Removes the Wanderer Rune's autocast. Scripts only add bonuses, so this can't be expressed; autocasts aren't computed anyway |
| 39488 Wickebine Tres (set, Rogue) | disables Wanderer auto-intimidate | same as The Paper |
| 39475 Shinobi | without Cloaking ≥ 3, only next to a wall | a positional condition, nothing for a planner |

## Album effects (phase 8; stored now, never applied)

These only matter once the card album exists, but they still have to be
TODO-free before `Reviewed: true`.

| Rune | TODO | Proposed |
| --- | --- | --- |
| 39163 Laurell Weinder | Frost Diver +15%, Frost Nova +22% | `bonus2 bSkillAtk,"MG_FROSTDIVER",15; bonus2 bSkillAtk,"WZ_FROSTNOVA",22;` ✓ |
| 39191 Red Ferus | Fire Ball +15%; Fire Wall, Fire Pillar, Sightrasher +10% | `bonus2 bSkillAtk,"MG_FIREBALL",15; bonus2 bSkillAtk,"MG_FIREWALL",10; bonus2 bSkillAtk,"WZ_FIREPILLAR",10; bonus2 bSkillAtk,"WZ_SIGHTRASHER",10;` ✓ |
| 39448 Imp | Flaming Petals +25% | `bonus2 bSkillAtk,"NJ_KOUENKA",25;` ✓ |
| 39476 Siroma | Freezing Spear +25% | `bonus2 bSkillAtk,"NJ_HYOUSENSOU",25;` ✓ |
| 39272 Brilight, 39280 Demon Pungus, 39304 Majoruros | chance increased to 12% | a second `bonus2 bAddEffWhenHit,Eff_<status>,600;` (D2) ✓ |
| 39279 Dark Frame, 39293 Giant Spider, 39301 Kraben | to 12%, plus a mechanic | the D2 line, plus a comment for the rest (Stone Curse on MVPs, faster poison ticks, Blind refresh) |
| 39438 Greatest General | triples the chance | `bonus3 bAutoSpell,"MO_CALLSPIRITS",5,4+36*(BaseClass == Job_Acolyte);` (adds twice the base, D2) ✓ |
| 39200 Sidewinder | Double Attack +25% if on a dagger | `bonus bDoubleRate,25;` plus `// only on a dagger`; the script subset can't read the host's weapon type, so phase 8 needs a condition for it ? |
| 39453 Lude | remove autocasts; cast delay −30% | `bonus bDelayrate,-30;` plus a comment: "remove autocast" replaces the base effect, which album entries (additive) can't do yet. Phase 8 design point |
| 39475 Shinobi | remove the Cloaking autocast | comment; same phase 8 design point as Lude |
| 39104, 39149, 39153, 39155, 39178, 39217 (Zipper Bear Card album) | +5% with basic attacks and Chain Action, Triple Attack, Chain Combo, Combo Finish, combo-chained Asura Strike | Comment. The skill part could be `bSkillAtk` on `GS_CHAINACTION`, `MO_TRIPLEATTACK`, `MO_CHAINCOMBO`, `MO_COMBOFINISH`, but "basic attacks only" and "combo-chained Asura only" have no bonus. Decide in phase 8 |
| 39352 Enchanted Peach Tree | Heal +10% when self-healing | nearest is `bonus2 bSkillHeal,"AL_HEAL",10;`, which also counts healing others. Comment or approximation? ? |
| 39267 Argiope | Poison React SP −30%, triggers on misses | `bonus2 bSkillUseSPrate,"AS_POISONREACT",30;` plus a comment for "on misses" |
| 39140 Familiar, 39175 Metaller, 39189 Plankton, 39196 Savage Babe, 39204 Snake, 39325 Sandman, 39437 Gazeti | status duration and resistance tweaks, sleep, Stone Curse area, "multiple Gazeti runes stack" | ccRO mechanics with no rAthena bonus: comment (D1). Gazeti: runes already stack in the engine, so a comment is enough |

## Sidewinder: how rAthena handles double attack

Source: rAthena `src/map` (pre-renewal), read locally.

- **The roll** (`battle.cpp:4311`, `battle_calc_multi_attack`, normal attacks
  only): chance `max(5 × TF_DOUBLE level, bonus.double_rate)`. On a hit the
  attack lands 2 hits (`div_ = 2`), gets HIT + TF_DOUBLE level, and cannot
  crit.
- **Which weapons:** a *learned* TF_DOUBLE needs a dagger. A *granted* one
  (`skill "TF_DOUBLE",1;` from a card or item, flag above PERMANENT) works with
  any weapon except bare hands. That is why a vanilla Sidewinder Card in a
  katar double attacks. `bDoubleRate` / `bDoubleAddRate` also work with any
  weapon.
- **Learned plus granted:** `skill` takes the max level (`pc.cpp:5466`), it
  does not add. A side effect: a Thief with Double Attack Lv 10 who also
  wears the card gets 50% on *any* weapon, katar included, because the skill
  now counts as granted.
- **Katar off-hand hit** (`battle.cpp:5034`): every katar normal attack adds
  a second hit of damage × (1 + 2 × TF_DOUBLE level) / 100. A granted Lv 1
  raises it from 1% to 3%. It is independent of the double attack roll, so
  both can happen on the same attack.
- **bDoubleRate** keeps only the highest value; **bDoubleAddRate** adds to it.
  No vanilla item uses either; every double attack item uses
  `skill "TF_DOUBLE",n`.

**Recommendation for 39200 Sidewinder Rune:**
- Base: `skill "TF_DOUBLE",1;`, as the vanilla card. It works on a katar,
  as you see in game, and it also raises the katar off-hand hit to 3%.
  `bDoubleRate,5` would give the same 5% but leave the off-hand hit at 1%.
- Album "+25% if on a dagger": `bonus bDoubleAddRate,25;` (adds, so 30% in
  total) behind a dagger check. rAthena would write the check as
  `getiteminfo(getequipid(EQI_HAND_R), ITEMINFO_VIEW) == W_DAGGER`, which is
  outside the planner's script subset; phase 8 needs a way to say it.
- Engine follow-up (when skills are modelled): the planner does not compute
  double attack yet, and it computes the katar off-hand hit with
  TF_DOUBLE Lv 0 (`autoAttack.ts:437`). It should read the granted level, and
  expected damage gets a factor of about 1 + chance for normal attacks.

## Suggested order

1. S1 and S2 (structure), since they affect what is applied today.
2. The ✓ rows: mechanical, about 60 lines.
3. Answer the **?** rows (10 numbers or interpretations, mostly D3 defaults).
4. D1: comment or `Unmodelled` field. Then set `Reviewed: true` and run
   `pnpm data`, which rejects any reviewed rune that still has a TODO.

I can apply any of this. Tell me which decisions to take, and whether
"rAthena value" is acceptable for the **?** rows until you can check them
in game.
