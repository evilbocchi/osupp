import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    Dec2017PpCalculator,
    Feb2015PpCalculator,
    Feb2019PpCalculator,
    Jan2014PpCalculator,
    Jan2021PpCalculator,
    Jul2015PpCalculator,
    Jul2021PpCalculator,
    Jul2026PpCalculator,
    Mar2025PpCalculator,
    May2018PpCalculator,
    Nov2021PpCalculator,
    Oct2024PpCalculator,
    Oct2025PpCalculator,
    Sep2022PpCalculator,
    calculateBonusPp,
    calculateProfilePp,
    parseBeatmap,
    type PpCalculatorResult,
} from ".";

const fixturePath = (...segments: string[]) =>
    join(import.meta.dir, "..", "fixtures", ...segments);

function readFixture(filename: string): PpCalculatorResult {
    return JSON.parse(readFileSync(fixturePath(filename), "utf8"));
}

function scoreResult(beatmapId: number, pp: number): PpCalculatorResult {
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

function expectCloseValues(
    mismatches: string[],
    name: string,
    received: number | undefined,
    expected: number | undefined,
    toleranceDigits: number,
) {
    if (received === undefined || expected === undefined) {
        mismatches.push(`${name}: expected ${expected}, received ${received}`);
        return;
    }

    const tolerance = 0.5 * 10 ** -toleranceDigits;
    const difference = Math.abs(received - expected);

    if (difference >= tolerance) {
        mismatches.push(
            `${name}: expected ${expected}, received ${received}, difference ${difference}, tolerance < ${tolerance}`,
        );
    }
}

describe("parseBeatmap", () => {
    test.each(["164020.osu", "4921872.osu", "5047712.osu"])(
        "parses %s into beatmap data",
        (filename) => {
            const content = readFileSync(fixturePath(filename), "utf8");
            const beatmap = parseBeatmap(content);

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

describe("calculateBonusPp", () => {
    test("starts at zero scores", () => {
        expect(calculateBonusPp(0)).toBe(0);
    });

    test("caps unique score count at 1000", () => {
        expect(calculateBonusPp(1001)).toBe(calculateBonusPp(1000));
    });
});

describe("calculateProfilePp", () => {
    test("keeps the best score per beatmap before weighting", () => {
        const profile = calculateProfilePp([
            scoreResult(10, 100),
            scoreResult(10, 150),
            scoreResult(20, 80),
        ]);

        expect(profile.score_count).toBe(2);
        expect(profile.weighted_pp).toBeCloseTo(150 + 80 * 0.95);
        expect(profile.total_pp).toBeCloseTo(
            profile.weighted_pp + profile.bonus_pp,
        );
    });
});

describe.each([
    ["jan2014", Jan2014PpCalculator],
    ["feb2015", Feb2015PpCalculator],
    ["jul2015", Jul2015PpCalculator],
    ["dec2017", Dec2017PpCalculator],
    ["may2018", May2018PpCalculator],
    ["feb2019", Feb2019PpCalculator],
    ["jan2021", Jan2021PpCalculator],
    ["jul2021", Jul2021PpCalculator],
    ["nov2021", Nov2021PpCalculator],
    ["sep2022", Sep2022PpCalculator],
    ["oct2024", Oct2024PpCalculator],
    ["mar2025", Mar2025PpCalculator],
    ["oct2025", Oct2025PpCalculator],
    ["jul2026", Jul2026PpCalculator],
] as const)("%s", (reworkSlug, Calculator) => {
    test.each(
        readdirSync(fixturePath())
            .filter((filename) => filename.endsWith(`_${reworkSlug}.json`))
            .sort()
            .map((fixtureFilename) => {
                const fixture = readFixture(fixtureFilename);

                return [
                    fixtureFilename,
                    `${fixture.score.beatmap_id}.osu`,
                ] as const;
            }),
    )("%s", (fixtureFilename, beatmapFilename) => {
        const fixture = readFixture(fixtureFilename);
        const beatmap = parseBeatmap(
            readFileSync(fixturePath(beatmapFilename), "utf8"),
        );
        const result = new Calculator().calculate_score(
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

            expectCloseValues(
                mismatches,
                `difficulty_attributes.${key}`,
                result.difficulty_attributes[key],
                fixture.difficulty_attributes[key],
                tolerance_digits,
            );
        }

        for (const key of ["effective_miss_count", "pp"] as const) {
            // DO NOT CHANGE THE TOLERANCE
            expectCloseValues(
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
});
