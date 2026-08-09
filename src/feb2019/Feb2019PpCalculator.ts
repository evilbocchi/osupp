import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";
import type { DifficultyAttributes } from "../mar2025/DifficultyCalculator";
import { calculate_feb2019_difficulty } from "./Feb2019DifficultyCalculator";

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
    beatmap: BeatmapData,
    difficulty: DifficultyAttributes,
) {
    const source_score = score as ScoreData & { combo?: number };
    const stats = score.statistics as Record<string, number | undefined>;
    const mods = mod_names(score);
    const count_great = stats.great ?? 0;
    const count_good = stats.ok ?? 0;
    const count_meh = stats.meh ?? 0;
    const count_miss = stats.miss ?? 0;
    const total_hits = count_great + count_good + count_meh + count_miss;
    const accuracy =
        total_hits > 0
            ? (count_great * 300 + count_good * 100 + count_meh * 50) /
              (total_hits * 300)
            : 0;
    const max_combo = difficulty.max_combo;
    const combo = source_score.combo ?? 0;

    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
    const miss_penalty = 0.97 ** count_miss;
    const combo_scaling =
        max_combo > 0 ? Math.min(combo ** 0.8 / max_combo ** 0.8, 1) : 0;
    let approach_rate_factor = 1;
    if (difficulty.approach_rate > 10.33) {
        approach_rate_factor += 0.3 * (difficulty.approach_rate - 10.33);
    } else if (difficulty.approach_rate < 8) {
        approach_rate_factor += 0.01 * (8 - difficulty.approach_rate);
    }

    let aim =
        base_value(difficulty.aim_difficulty) *
        length_bonus *
        miss_penalty *
        combo_scaling *
        approach_rate_factor;
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
        miss_penalty *
        combo_scaling;
    let speed_approach_rate_factor = 1;
    if (difficulty.approach_rate > 10.33) {
        speed_approach_rate_factor += 0.3 * (difficulty.approach_rate - 10.33);
    }
    speed *= speed_approach_rate_factor;
    if (mods.includes("HD"))
        speed *= 1 + 0.04 * (12 - difficulty.approach_rate);
    speed *= 0.02 + accuracy;
    speed *= 0.96 + difficulty.overall_difficulty ** 2 / 1600;

    const better_accuracy =
        difficulty.hit_circle_count > 0
            ? ((count_great - (total_hits - difficulty.hit_circle_count)) * 6 +
                  count_good * 2 +
                  count_meh) /
              (difficulty.hit_circle_count * 6)
            : 0;
    const accuracy_value =
        Math.pow(1.52163, difficulty.overall_difficulty) *
        Math.pow(Math.max(0, better_accuracy), 24) *
        2.83 *
        Math.min(1.15, (difficulty.hit_circle_count / 1000) ** 0.3) *
        (mods.includes("HD") ? 1.08 : 1) *
        (mods.includes("FL") ? 1.02 : 1);

    const multiplier =
        1.12 *
        (mods.includes("NF") ? 0.9 : 1) *
        (mods.includes("SO") ? 0.95 : 1);
    const pp =
        (aim ** 1.1 + speed ** 1.1 + accuracy_value ** 1.1) ** (1 / 1.1) *
        multiplier;

    return {
        aim,
        speed,
        accuracy: accuracy_value,
        effective_miss_count: 0,
        pp,
    };
}

/**
 * Wide angle aim rebalance and flow aim nerf
 *
 * https://osu.ppy.sh/home/news/2019-02-05-new-changes-to-star-rating-performance-points
 *
 * Target: actual pp values (wayback machine)
 */
export default class Feb2019PpCalculator extends PpCalculator {
    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const difficulty = calculate_feb2019_difficulty(
            beatmap,
            mod_names(score),
        );

        return {
            performance: calculate_performance_values(
                score,
                beatmap,
                difficulty,
            ),
            difficulty,
        };
    }
}
