import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse_osu_content } from "../src/BeatmapData";
import Mar2025PpCalculator from "../src/mar2025/Mar2025PpCalculator";
import Oct2024PpCalculator from "../src/oct2024/Oct2024PpCalculator";
import {
    calculate_bonus_pp,
    calculate_profile_pp,
    type PpCalculatorResult,
} from "../src/PpCalculator";

const fixture_path = (...segments: string[]) =>
    join(import.meta.dir, "fixtures", ...segments);

function read_fixture(filename: string): PpCalculatorResult {
    return JSON.parse(readFileSync(fixture_path(filename), "utf8"));
}

function score_result(beatmapId: number, pp: number): PpCalculatorResult {
    return {
        score: {
            ruleset_id: 0,
            beatmap_id: beatmapId,
            mods: [],
            total_score: 1_000_000,
            legacy_total_score: 1_000_000,
            accuracy: 100,
            max_combo: 1,
        },
        performance_attributes: {
            aim: 0,
            speed: 0,
            accuracy: 0,
            effective_miss_count: 0,
            pp,
        },
        difficulty_attributes: {
            star_rating: 0,
            max_combo: 1,
            aim_difficulty: 0,
            speed_difficulty: 0,
            approach_rate: 5,
            overall_difficulty: 5,
            circle_size: 5,
        },
        user_id: 1,
        score_id: beatmapId,
    };
}

function expect_close_values(
    mismatches: string[],
    name: string,
    received: number | undefined,
    expected: number | undefined,
    tolerance_digits: number,
) {
    if (received === undefined || expected === undefined) {
        mismatches.push(`${name}: expected ${expected}, received ${received}`);
        return;
    }

    const tolerance = 0.5 * 10 ** -tolerance_digits;
    const difference = Math.abs(received - expected);

    if (difference >= tolerance) {
        mismatches.push(
            `${name}: expected ${expected}, received ${received}, difference ${difference}, tolerance < ${tolerance}`,
        );
    }
}

describe("calculate_bonus_pp", () => {
    test("starts at zero scores", () => {
        expect(calculate_bonus_pp(0)).toBe(0);
    });

    test("caps unique score count at 1000", () => {
        expect(calculate_bonus_pp(1001)).toBe(calculate_bonus_pp(1000));
    });
});

describe("calculate_profile_pp", () => {
    test("keeps the best score per beatmap before weighting", () => {
        const profile = calculate_profile_pp([
            score_result(10, 100),
            score_result(10, 150),
            score_result(20, 80),
        ]);

        expect(profile.score_count).toBe(2);
        expect(profile.weighted_pp).toBeCloseTo(150 + 80 * 0.95);
        expect(profile.total_pp).toBeCloseTo(
            profile.weighted_pp + profile.bonus_pp,
        );
    });
});

for (const [rework_slug, calculator_class] of [
    ["oct2024", Oct2024PpCalculator],
    ["mar2025", Mar2025PpCalculator],
] as const) {
    test.each(
        readdirSync(fixture_path())
            .filter((filename) => filename.endsWith(`_${rework_slug}.json`))
            .sort()
            .map((fixture_filename) => {
                const fixture = read_fixture(fixture_filename);

                return [
                    fixture_filename,
                    `${fixture.score.beatmap_id}.osu`,
                ] as const;
            }),
    )("%s", (fixture_filename, beatmap_filename) => {
        const fixture = read_fixture(fixture_filename);
        const beatmap = parse_osu_content(
            readFileSync(fixture_path(beatmap_filename), "utf8"),
        );
        const result = new calculator_class().calculate_score(
            fixture.score as any,
            beatmap,
        );
        expect(result.difficulty_attributes.max_combo).toBe(
            fixture.difficulty_attributes.max_combo,
        );

        // DONT CHANGE THE TOLERANCE IF YOUR TESTS FAIL.
        // 3DP IS ALREADY GENEROUSLY TOLERANT OF FLOATING POINT ERRORS.
        // IF YOUR ERROR IS LARGER THAN 3DP, SOMETHING IS WRONG WITH YOUR IMPLEMENTATION.
        const tolerance_digits = 3;
        const mismatches: string[] = [];

        for (const key of [
            "star_rating",
            "aim_difficulty",
            "speed_difficulty",
            "speed_note_count",
            "aim_difficult_slider_count",
            "aim_difficult_strain_count",
            "speed_difficult_strain_count",
        ] as const) {
            if (fixture.difficulty_attributes[key] === undefined) continue;

            expect_close_values(
                mismatches,
                `difficulty_attributes.${key}`,
                result.difficulty_attributes[key],
                fixture.difficulty_attributes[key],
                tolerance_digits,
            );
        }

        for (const key of ["effective_miss_count", "pp"] as const) {
            // DO NOT CHANGE THE TOLERANCE
            expect_close_values(
                mismatches,
                `performance_attributes.${key}`,
                result.performance_attributes[key],
                fixture.performance_attributes[key],
                tolerance_digits,
            );
        }

        if (mismatches.length > 0) {
            throw new Error(
                `Mismatched values:\n${mismatches.map((mismatch) => `- ${mismatch}`).join("\n")}`,
            );
        }
    });
}
