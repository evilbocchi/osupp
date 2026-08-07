import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator, { type PpCalculatorResult } from "../PpCalculator";
import May2018PpCalculator from "../may2018/May2018PpCalculator";

/**
 * No news post found for this rework.
 *
 * Target: actual pp values (wayback machine)
 */
export default class Dec2017PpCalculator extends PpCalculator {
    private readonly may2018 = new May2018PpCalculator({ ruleset_id: null });

    protected calculate_performance(
        score: ScoreData,
        beatmap: BeatmapData,
    ): {
        performance: PpCalculatorResult["performance_attributes"];
        difficulty: PpCalculatorResult["difficulty_attributes"];
    } {
        const result = this.may2018.calculate_score(score, beatmap);
        const mods = (score.mods ?? []).map((mod) => mod.acronym);
        const miss =
            (score.statistics as Record<string, number | undefined>).miss ?? 0;

        let aim = result.performance_attributes.aim;
        let speed = result.performance_attributes.speed;
        let pp = result.performance_attributes.pp;

        if (mods.includes("HD")) {
            const aim_bonus =
                1.02 + (11 - result.difficulty_attributes.approach_rate) / 50;
            aim = (aim / aim_bonus) * 1.18;
            speed /= 1.18;
            const accuracy = result.performance_attributes.accuracy;
            pp =
                (aim ** 1.1 + speed ** 1.1 + accuracy ** 1.1) ** (1 / 1.1) *
                1.12;

            if (mods.includes("NF")) pp *= 0.9;
            if (mods.includes("SO")) pp *= 0.95;
        }

        return {
            performance: {
                ...result.performance_attributes,
                aim,
                speed,
                effective_miss_count: miss,
                pp,
            },
            difficulty: result.difficulty_attributes,
        };
    }
}
