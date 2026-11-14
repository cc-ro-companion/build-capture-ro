# data-overrides

Hand-maintained differences between ccRO and rAthena pre-renewal: changed
items, monsters and jobs, and later ccRO-only content such as runes, the card
album and costumes.

Rules:
- Only ccRO differences live here; anything that matches rAthena comes from
  the generator.
- The generator in [`../data-pipeline`](../data-pipeline) merges these files
  on top of the rAthena data. After editing a file here, run `pnpm data` and
  commit the regenerated `src/data/generated/` together with the edit;
  `pnpm test` fails if you forget.
- Add a comment with the source (patch note, forum post, in-game check) next
  to every change.

## Files

| File | Applies to (rAthena `db/pre-re/`) | Entries keyed by |
| --- | --- | --- |
| `meta.yml` | – | – |
| `items.yml` | `item_db_equip.yml` | `Id` |
| `monsters.yml` | `mob_db.yml` | `Id` |
| `jobs.yml` | `job_stats.yml`, `job_aspd.yml`, `job_exp.yml` | `Job` |
| `hidden-items.yml` | generated equipment | `id` |
| `runes.yml` | – (ccRO only) | `Id` |

`hidden-items.yml` has its own format: review groups, each a list of
`{ id, name, hide, reason }` entries, one per line. Items with `hide: true`
are not obtainable on ccRO; they stay in the data, so builds that use them
keep loading, but search leaves them out unless "show hidden items" is
ticked. `pnpm data` stops if a hidden id is not generated equipment.

`runes.yml` holds every ccRO rune, keyed by its client item id (39xxx). It
was drafted once from the client's item info by
`data-pipeline/tools/draft-runes.ts` and is maintained by hand. Each entry:
```yaml
  # client text the entry was drafted from, as a comment
  - Id: 39105
    Name: 'Assaulter Rune'
    Location: Weapon        # Weapon, Shield, Armor, Garment, Footgear, Accessory, Headgear
    Reviewed: false         # true once checked against the client text
    Script: |               # rAthena item script; getrefine() is the host item's refine
      bonus bCritAtkRate,10;
    Sets:                   # bonus while these other runes are equipped too
      - Requires: [39331, 39531]
        Script: |
          bonus bStr,10;
    Album:                  # card album effects (phase 8): stored, not applied
      - Requires: ['Mobster Card']
        RightHandOnly: true
        Script: |
          bonus bCritical,3;
```
`# TODO: <client text>` lines are text the draft could not map. They are
skipped while `Reviewed: false`; `pnpm data` stops if a reviewed rune still
has one, if a script does not parse, or if a set names an unknown rune.

`meta.yml` holds the data label shown in the app footer:
```yaml
Label: 'ccRO 2026-11'
```
Bump it when a change matters to users. The data hash next to it changes on
its own whenever the generated data changes.

## Format

Each override file has a `Body` list and, except `jobs.yml`, a `Remove` list.
Entries use rAthena's field names and values, exactly as in the rAthena file
they apply to:
```yaml
# items.yml
Body:
  - Id: 1101          # existing id: only the listed fields change
    Attack: 30        # source: ccRO patch notes 2026-10-01
  - Id: 1102
    Jobs:             # maps merge key by key, like rAthena's db/import
      Novice: false
  - Id: 990001        # unknown id: a new entry
    AegisName: Example_Sword
    Name: Example Sword
    Type: Weapon
    SubType: 1hSword
    Attack: 40
    Jobs:
      Swordman: true
    Locations:
      Right_Hand: true
Remove:
  - 1103              # dropped from the output
```

Merge rules:
- Scalars and lists replace the rAthena value. For example, `BonusStats` in
  `jobs.yml` must be given in full.
- Maps (`Jobs`, `Locations`, `Flags`, `BaseASPD`, `Modes`, ...) merge key by
  key; to turn a key off, set it to `false`.
- A new entry needs every required field: `AegisName`, `Name` and `Type` for
  items, `AegisName` and `Name` for monsters. Absent optional fields get
  rAthena's defaults.

`jobs.yml` patches one job at a time, by rAthena job name, even where rAthena
groups several jobs in one entry. Jobs cannot be added or removed; the
supported job list is fixed by the generator.
```yaml
# jobs.yml
Body:
  - Job: Knight
    BaseASPD:
      2hSword: 540
  - Job: Super_Novice
    MaxJobLevel: 70
```

## Errors

`pnpm data` stops with a message naming the file and the id when:
- a field name is not one of rAthena's (catches typos such as `Atack`),
- a new entry is missing a required field,
- `Remove` lists an id that does not exist,
- `jobs.yml` names a job that is not supported.
