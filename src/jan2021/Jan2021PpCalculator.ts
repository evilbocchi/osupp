import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";
import { calculate_feb2019_difficulty } from "../feb2019/Feb2019DifficultyCalculator";
import type { DifficultyAttributes } from "../mar2025/DifficultyCalculator";

const STAR_SCALING_FACTOR = 0.0675;

function mod_names(score: ScoreData): string[] {
    return (score.mods ?? []).map((mod) => mod.acronym);
}

function base_value(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / STAR_SCALING_FACTOR) - 4) ** 3 / 100000
    );
}

function miss_penalty(
    miss_count: number,
    total_hits: number,
    exponent: number,
): number {
    if (miss_count <= 0) return 1;

    return 0.97 * (1 - (miss_count / total_hits) ** 0.775) ** exponent;
}

function combo_scaling(combo: number, max_combo: number): number {
    return max_combo > 0 ? Math.min(combo ** 0.8 / max_combo ** 0.8, 1) : 0;
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
    const combo_factor = combo_scaling(combo, difficulty.max_combo);

    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);

    let approach_rate_factor = 0;
    if (difficulty.approach_rate > 10.33) {
        approach_rate_factor = 0.4 * (difficulty.approach_rate - 10.33);
    } else if (difficulty.approach_rate < 8) {
        approach_rate_factor = 0.01 * (8 - difficulty.approach_rate);
    }
    const approach_rate_bonus =
        1 +
        Math.min(
            approach_rate_factor,
            approach_rate_factor * (total_hits / 1000),
        );
    const speed_approach_rate_factor =
        difficulty.approach_rate > 10.33
            ? 0.4 * (difficulty.approach_rate - 10.33)
            : 0;
    const speed_approach_rate_bonus =
        1 +
        Math.min(
            speed_approach_rate_factor,
            speed_approach_rate_factor * (total_hits / 1000),
        );

    let aim =
        base_value(difficulty.aim_difficulty) *
        length_bonus *
        miss_penalty(count_miss, total_hits, count_miss) *
        combo_factor *
        approach_rate_bonus;
    if (mods.includes("TD")) aim = aim ** 0.8;
    if (mods.includes("HD")) aim *= 1 + 0.04 * (12 - difficulty.approach_rate);
    if (mods.includes("FL")) {
        aim *=
            1 +
            0.35 * Math.min(1, total_hits / 200) +
            (total_hits > 200
                ? 0.3 * Math.min(1, (total_hits - 200) / 300) +
                  (total_hits > 500 ? (total_hits - 500) / 1200 : 0)
                : 0);
    }
    aim *= 0.5 + accuracy / 2;
    aim *= 0.98 + difficulty.overall_difficulty ** 2 / 2500;

    let speed =
        base_value(difficulty.speed_difficulty) *
        length_bonus *
        miss_penalty(count_miss, total_hits, count_miss ** 0.875) *
        combo_factor *
        speed_approach_rate_bonus;
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
    let accuracy_value =
        1.52163 ** difficulty.overall_difficulty *
        Math.max(0, better_accuracy) ** 24 *
        2.83 *
        Math.min(1.15, (difficulty.hit_circle_count / 1000) ** 0.3);
    if (mods.includes("HD")) accuracy_value *= 1.08;
    if (mods.includes("FL")) accuracy_value *= 1.02;

    let multiplier = 1.12;
    if (mods.includes("NF")) multiplier *= Math.max(0.9, 1 - 0.02 * count_miss);
    if (mods.includes("SO"))
        multiplier *= 1 - (difficulty.spinner_count / total_hits) ** 0.85;

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
 * High AR rebalance
 *
 * https://osu.ppy.sh/home/news/2021-01-14-performance-points-updates
 *
 * Target: actual pp values
 */
export default class Jan2021PpCalculator extends PpCalculator {
    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const difficulty = calculate_feb2019_difficulty(
            beatmap,
            mod_names(score),
        );

        return {
            performance: calculate_performance_values(score, difficulty),
            difficulty,
        };
    }
}
