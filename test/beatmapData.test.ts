import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse_osu_content } from "../src/BeatmapData";

const fixturePath = (...segments: string[]) =>
    join(import.meta.dir, "fixtures", ...segments);

describe("parse_osu_content", () => {
    test.each(["164020.osu", "4921872.osu", "5047712.osu"])(
        "parses %s into beatmap data",
        (filename) => {
            const content = readFileSync(fixturePath(filename), "utf8");
            const beatmap = parse_osu_content(content);

            expect(beatmap.hit_objects.length).toBeGreaterThan(0);
            expect(
                beatmap.num_hit_circles +
                    beatmap.num_sliders +
                    beatmap.num_spinners,
            ).toBe(beatmap.hit_objects.length);
            expect(beatmap.max_combo).toBeGreaterThanOrEqual(
                beatmap.hit_objects.length,
            );
            expect(beatmap.od).toBeGreaterThanOrEqual(0);
            expect(beatmap.ar).toBeGreaterThanOrEqual(0);
            expect(beatmap.cs).toBeGreaterThan(0);
        },
    );
});
