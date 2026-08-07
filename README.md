# osu-pp

[![npm version](https://img.shields.io/npm/v/osu-pp)](https://www.npmjs.com/package/osu-pp)

A pure-JavaScript osu pp calculator that supports different eras of the game.

```sh
bun install osu-pp
```

## Usage

```ts
import { readFile } from "node:fs/promises";
import { calculateScore } from "osu-pp";

const beatmap = await readFile("./beatmap.osu", "utf8");

const result = calculateScore({
    beatmap,
    rework: "sep2022",
    score: {
        ruleset_id: 0,
        beatmap_id: 123456,
        mods: [{ acronym: "" }],
        total_score: 1_000_000,
        legacy_total_score: 1_000_000,
        accuracy: 98.5,
        max_combo: 850,
    },
});

console.log(result.performance_attributes.pp);
```

## Development

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for more information.
