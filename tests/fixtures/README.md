# tests/fixtures

Characters validated against ccRO's training dummy: the build plus the
numbers observed in game. Tests compare the engine's output with these
numbers, so a validated formula cannot regress silently.

Each fixture records when it was validated and the data version it was
made with. Fixtures are added from phase 3 on.

## Auto attack fixtures

One YAML file per validated character in [`auto-attack/`](auto-attack);
[`fixtures.test.ts`](fixtures.test.ts) runs all of them.

```yaml
name: Swordman 50/30 Sword
validatedOn: 2026-11-20
dataHash: a1000f15 # data version used; informational
build: # the readable build JSON the app saves, without d/l
  v: 1
  job: 1
  baseLevel: 50
  jobLevel: 30
  stats: { str: 50, agi: 30, vit: 30, int: 1, dex: 30, luk: 1 }
  weapon: 1101
  dummies: # the dummy settings used in game
    - name: Default dummy
      level: 1
      def: 1
      mdef: 1
      str: 1
      agi: 1
      vit: 1
      int: 1
      dex: 1
      luk: 1
      size: medium # small, medium, large
      race: Formless
      element: Neutral
      elementLevel: 1
  target: { dummy: 0 } # or { monster: <id> }
observed:
  status: { atk: [n, n], hit: n, flee: n, crit: n, aspd: n }
  normal: { min: n, max: n, rangeComplete: false }
  crit: { min: n, max: n } # optional
  dps: # optional, from one uninterrupted session of 2 minutes or more
    windows: [n, n, n] # every "I've taken x DPS in last 5 seconds." value, in order
    # tolerance: 0.1 # only with toleranceReason
notes: free text, e.g. how many hits were sampled
```

How the numbers are compared ([`compare.ts`](compare.ts)):

| Observed | Rule |
| --- | --- |
| `status` | ATK (both numbers), HIT, FLEE (without perfect dodge), CRIT and ASPD as shown in the status window must match exactly. |
| `normal` | The lowest and highest normal hit seen must lie inside the engine's range. With `rangeComplete: true` they must equal it. |
| `crit` | Must equal the engine's crit range. |
| `dps` | The first and last window are dropped as partial; the mean of the rest plus 0.4 (the dummy prints damage ÷ 5 rounded down) must be within ±5 % of the engine's DPS, or within `tolerance` when the fixture gives a `toleranceReason`. |

The build must be valid with the current data (no normalize warnings) and
must have a target, normally the training dummy as configured in game. `synthetic: true` marks a fixture that holds engine
output rather than game observations; it only tests the runner.

The fixtures from the first validation session (2026-11-13) come from the
in-game notes in `docs/phase-3-validation-runs.yml` and the chat logs in
`docs/phase-3-validation-long-runs.txt`. Hit counts and DPS windows of
short sessions are kept in each fixture's notes.
