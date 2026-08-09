import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";
import type { DifficultyAttributes } from "../mar2025/DifficultyCalculator";
import { calculate_jul2021_difficulty } from "./Jul2021DifficultyCalculator";

const STAR_SCALING_FACTOR = 0.0675;

function mod_names(score: ScoreData): string[] {
    return (score.mods ?? []).map((mod) => mod.acronym);
}

function base_value(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / STAR_SCALING_FACTOR) - 4) ** 3 / 100000
    );
}

function calculate_performance_values(
    score: ScoreData,
    difficulty: DifficultyAttributes,
) {
    const source_score = score as ScoreData & { combo?: number };
    const stats = score.statistics as Record<string, number | undefined>;
    const mods = mod_names(score);
    const count_great = stats.great ?? 0;
    const count_ok = stats.ok ?? 0;
    const count_meh = stats.meh ?? 0;
    const count_miss = stats.miss ?? 0;
    const total_hits = count_great + count_ok + count_meh + count_miss;
    const accuracy = (score.accuracy ?? 0) / 100;
    const combo = source_score.combo ?? score.max_combo ?? 0;

    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);

    const miss_penalty = (exponent: number) =>
        count_miss > 0
            ? 0.97 * (1 - (count_miss / total_hits) ** 0.775) ** exponent
            : 1;
    const combo_scaling =
        difficulty.max_combo > 0
            ? Math.min(combo ** 0.8 / difficulty.max_combo ** 0.8, 1)
            : 0;

    let approach_rate_factor = 0;
    if (difficulty.approach_rate > 10.33) {
        approach_rate_factor = difficulty.approach_rate - 10.33;
    } else if (difficulty.approach_rate < 8) {
        approach_rate_factor = 0.025 * (8 - difficulty.approach_rate);
    }
    const approach_rate_total_hits_factor =
        1 / (1 + Math.exp(-(0.007 * (total_hits - 400))));
    const approach_rate_bonus =
        1 +
        (0.03 + 0.37 * approach_rate_total_hits_factor) * approach_rate_factor;

    let aim =
        base_value(difficulty.aim_difficulty) *
        length_bonus *
        miss_penalty(count_miss) *
        combo_scaling;
    if (mods.includes("TD")) aim = aim ** 0.8;
    if (mods.includes("HD")) aim *= 1 + 0.04 * (12 - difficulty.approach_rate);
    let flashlight_bonus = 1;
    if (mods.includes("FL")) {
        flashlight_bonus =
            1 +
            0.35 * Math.min(1, total_hits / 200) +
            (total_hits > 200
                ? 0.3 * Math.min(1, (total_hits - 200) / 300) +
                  (total_hits > 500 ? (total_hits - 500) / 1200 : 0)
                : 0);
    }
    aim *= Math.max(flashlight_bonus, approach_rate_bonus);
    aim *= 0.5 + accuracy / 2;
    aim *= 0.98 + difficulty.overall_difficulty ** 2 / 2500;

    let speed =
        base_value(difficulty.speed_difficulty) *
        length_bonus *
        miss_penalty(count_miss ** 0.875) *
        combo_scaling;
    speed *=
        1 +
        (0.03 + 0.37 * approach_rate_total_hits_factor) *
            Math.max(0, difficulty.approach_rate - 10.33);
    if (mods.includes("HD"))
        speed *= 1 + 0.04 * (12 - difficulty.approach_rate);
    speed *=
        (0.95 + difficulty.overall_difficulty ** 2 / 750) *
        accuracy ** ((14.5 - Math.max(difficulty.overall_difficulty, 8)) / 2);
    speed *= 0.98 ** Math.max(0, count_meh - total_hits / 500);

    const better_accuracy =
        difficulty.hit_circle_count > 0
            ? ((count_great - (total_hits - difficulty.hit_circle_count)) * 6 +
                  count_ok * 2 +
                  count_meh) /
              (difficulty.hit_circle_count * 6)
            : 0;
    const accuracy_value =
        1.52163 ** difficulty.overall_difficulty *
        Math.max(0, better_accuracy) ** 24 *
        2.83 *
        Math.min(1.15, (difficulty.hit_circle_count / 1000) ** 0.3) *
        (mods.includes("HD") ? 1.08 : 1) *
        (mods.includes("FL") ? 1.02 : 1);

    const multiplier =
        1.12 *
        (mods.includes("NF") ? Math.max(0.9, 1 - 0.02 * count_miss) : 1) *
        (mods.includes("SO")
            ? 1 - (difficulty.spinner_count / total_hits) ** 0.85
            : 1);
    const pp =
        (aim ** 1.1 + speed ** 1.1 + accuracy_value ** 1.1) ** (1 / 1.1) *
        multiplier;

    return {
        aim,
        speed,
        accuracy: accuracy_value,
        effective_miss_count: count_miss,
        pp,
    };
}

/**
 * Difficulty spike nerf
 *
 * https://osu.ppy.sh/home/news/2021-07-27-performance-points-star-rating-updates
 *
 * Target: osu! source snapshot from July 22, 2021.
 */
export default class Jul2021PpCalculator extends PpCalculator {
    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const difficulty = calculate_jul2021_difficulty(
            beatmap,
            mod_names(score),
        );

        return {
            performance: calculate_performance_values(score, difficulty),
            difficulty,
        };
    }
}
