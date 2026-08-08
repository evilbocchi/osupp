import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";
import {
    calculate_nov2021_difficulty,
    type Nov2021DifficultyAttributes,
} from "./Nov2021DifficultyCalculator";

const DIFFICULTY_MULTIPLIER = 0.0675;

function mod_names(score: ScoreData): string[] {
    return (score.mods ?? []).map((mod) => mod.acronym);
}

function base_value(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / DIFFICULTY_MULTIPLIER) - 4) ** 3 / 100000
    );
}

function calculate_effective_miss_count(
    score_combo: number,
    difficulty: Nov2021DifficultyAttributes,
    miss_count: number,
    total_hits: number,
): { value: number; reported: number } {
    let combo_based_miss_count = 0;
    if (difficulty.slider_count > 0) {
        const full_combo_threshold =
            difficulty.max_combo - 0.1 * difficulty.slider_count;
        if (score_combo < full_combo_threshold) {
            combo_based_miss_count =
                full_combo_threshold / Math.max(1, score_combo);
        }
    }

    combo_based_miss_count = Math.min(combo_based_miss_count, total_hits);
    return {
        value: Math.max(miss_count, Math.floor(combo_based_miss_count)),
        reported: 0,
    };
}

function calculate_aim_value(
    difficulty: Nov2021DifficultyAttributes,
    mods: string[],
    accuracy: number,
    combo: number,
    total_hits: number,
    count_ok: number,
    count_meh: number,
    count_miss: number,
    effective_miss_count: number,
): number {
    let raw_aim = difficulty.aim_strain;
    if (mods.includes("TD")) raw_aim = raw_aim ** 0.8;

    let aim = base_value(raw_aim);
    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
    aim *= length_bonus;

    if (effective_miss_count > 0) {
        aim *=
            0.97 *
            (1 - (effective_miss_count / total_hits) ** 0.775) **
                effective_miss_count;
    }

    if (difficulty.max_combo > 0) {
        aim *= Math.min(combo ** 0.8 / difficulty.max_combo ** 0.8, 1);
    }

    let approach_rate_factor = 0;
    if (difficulty.approach_rate > 10.33) {
        approach_rate_factor = 0.3 * (difficulty.approach_rate - 10.33);
    } else if (difficulty.approach_rate < 8) {
        approach_rate_factor = 0.1 * (8 - difficulty.approach_rate);
    }
    aim *= 1 + approach_rate_factor * length_bonus;

    if (mods.includes("BL")) {
        aim *=
            1.3 +
            total_hits *
                (0.0016 / (1 + 2 * effective_miss_count)) *
                accuracy ** 16 *
                (1 - 0.003 * difficulty.drain_rate ** 2);
    } else if (mods.includes("HD")) {
        aim *= 1 + 0.04 * (12 - difficulty.approach_rate);
    }

    if (difficulty.slider_count > 0) {
        const estimated_difficult_sliders = difficulty.slider_count * 0.15;
        const estimated_slider_ends_dropped = clamp(
            Math.min(
                count_ok + count_meh + count_miss,
                difficulty.max_combo - combo,
            ),
            0,
            estimated_difficult_sliders,
        );
        const slider_nerf_factor =
            (1 - difficulty.slider_factor) *
                (1 -
                    estimated_slider_ends_dropped /
                        estimated_difficult_sliders) **
                    3 +
            difficulty.slider_factor;
        aim *= slider_nerf_factor;
    }

    aim *= accuracy;
    aim *= 0.98 + difficulty.overall_difficulty ** 2 / 2500;
    return aim;
}

function calculate_speed_value(
    difficulty: Nov2021DifficultyAttributes,
    mods: string[],
    accuracy: number,
    combo: number,
    total_hits: number,
    count_meh: number,
    effective_miss_count: number,
): number {
    let speed = base_value(difficulty.speed_strain);
    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
    speed *= length_bonus;

    if (effective_miss_count > 0) {
        speed *=
            0.97 *
            (1 - (effective_miss_count / total_hits) ** 0.775) **
                (effective_miss_count ** 0.875);
    }

    if (difficulty.max_combo > 0) {
        speed *= Math.min(combo ** 0.8 / difficulty.max_combo ** 0.8, 1);
    }

    let approach_rate_factor = 0;
    if (difficulty.approach_rate > 10.33) {
        approach_rate_factor = 0.3 * (difficulty.approach_rate - 10.33);
    }
    speed *= 1 + approach_rate_factor * length_bonus;

    if (mods.includes("BL")) speed *= 1.12;
    else if (mods.includes("HD"))
        speed *= 1 + 0.04 * (12 - difficulty.approach_rate);

    speed *=
        (0.95 + difficulty.overall_difficulty ** 2 / 750) *
        accuracy ** ((14.5 - Math.max(difficulty.overall_difficulty, 8)) / 2);
    speed *= 0.98 ** Math.max(0, count_meh - total_hits / 500);
    return speed;
}

function calculate_accuracy_value(
    difficulty: Nov2021DifficultyAttributes,
    mods: string[],
    count_great: number,
    count_ok: number,
    count_meh: number,
    total_hits: number,
): number {
    if (mods.includes("RX")) return 0;

    const amount_hit_objects_with_accuracy = difficulty.hit_circle_count;
    const better_accuracy_percentage =
        amount_hit_objects_with_accuracy > 0
            ? Math.max(
                  0,
                  ((count_great -
                      (total_hits - amount_hit_objects_with_accuracy)) *
                      6 +
                      count_ok * 2 +
                      count_meh) /
                      (amount_hit_objects_with_accuracy * 6),
              )
            : 0;

    let accuracy =
        1.52163 ** difficulty.overall_difficulty *
        better_accuracy_percentage ** 24 *
        2.83 *
        Math.min(1.15, (amount_hit_objects_with_accuracy / 1000) ** 0.3);

    if (mods.includes("BL")) accuracy *= 1.14;
    else if (mods.includes("HD")) accuracy *= 1.08;
    if (mods.includes("FL")) accuracy *= 1.02;
    return accuracy;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * https://osu.ppy.sh/home/news/2021-11-09-performance-points-star-rating-updates
 *
 * Target: osu 5a3be778a172405402bdcaadfdfdb7bb04ce190d
 */
export default class Nov2021PpCalculator extends PpCalculator {
    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const source_score = score as ScoreData & { combo?: number };
        const stats = score.statistics as Record<string, number | undefined>;
        const mods = mod_names(score);
        const difficulty = calculate_nov2021_difficulty(beatmap, mods);

        const count_great = stats.great ?? 0;
        const count_ok = stats.ok ?? 0;
        const count_meh = stats.meh ?? 0;
        const count_miss = stats.miss ?? 0;
        const total_hits = count_great + count_ok + count_meh + count_miss;
        const accuracy = (score.accuracy ?? 0) / 100;
        const combo = source_score.combo ?? score.max_combo ?? 0;
        const effective_miss = calculate_effective_miss_count(
            combo,
            difficulty,
            count_miss,
            total_hits,
        );
        let effective_miss_count = effective_miss.value;
        const reported_effective_miss_count = effective_miss.reported;

        let multiplier = 1.12;
        if (mods.includes("NF")) {
            multiplier *= Math.max(0.9, 1 - 0.02 * effective_miss_count);
        }
        if (mods.includes("SO")) {
            multiplier *= 1 - (difficulty.spinner_count / total_hits) ** 0.85;
        }
        if (mods.includes("RX")) {
            effective_miss_count = Math.min(
                effective_miss_count + count_ok + count_meh,
                total_hits,
            );
            multiplier *= 0.6;
        }

        const aim = calculate_aim_value(
            difficulty,
            mods,
            accuracy,
            combo,
            total_hits,
            count_ok,
            count_meh,
            count_miss,
            effective_miss_count,
        );
        const speed = calculate_speed_value(
            difficulty,
            mods,
            accuracy,
            combo,
            total_hits,
            count_meh,
            effective_miss_count,
        );
        const accuracy_value = calculate_accuracy_value(
            difficulty,
            mods,
            count_great,
            count_ok,
            count_meh,
            total_hits,
        );

        let flashlight = 0;
        if (mods.includes("FL")) {
            let raw_flashlight = difficulty.flashlight_rating;
            if (mods.includes("TD")) raw_flashlight = raw_flashlight ** 0.8;
            flashlight = raw_flashlight ** 2 * 25;
            if (effective_miss_count > 0) {
                flashlight *=
                    0.97 *
                    (1 - (effective_miss_count / total_hits) ** 0.775) **
                        (effective_miss_count ** 0.875);
            }
            if (difficulty.max_combo > 0) {
                flashlight *= Math.min(
                    combo ** 0.8 / difficulty.max_combo ** 0.8,
                    1,
                );
            }
            flashlight *=
                0.7 +
                0.1 * Math.min(1, total_hits / 200) +
                (total_hits > 200
                    ? 0.2 * Math.min(1, (total_hits - 200) / 200)
                    : 0);
            flashlight *= 0.5 + accuracy / 2;
            flashlight *= 0.98 + difficulty.overall_difficulty ** 2 / 2500;
        }

        const pp =
            (aim ** 1.1 +
                speed ** 1.1 +
                accuracy_value ** 1.1 +
                flashlight ** 1.1) **
                (1 / 1.1) *
            multiplier;

        return {
            performance: {
                aim,
                speed,
                accuracy: accuracy_value,
                flashlight,
                effective_miss_count: reported_effective_miss_count,
                pp,
            },
            difficulty: {
                star_rating: difficulty.star_rating,
                max_combo: difficulty.max_combo,
                aim_difficulty: difficulty.aim_strain,
                speed_difficulty: difficulty.speed_strain,
                flashlight_difficulty: difficulty.flashlight_rating,
                slider_factor: difficulty.slider_factor,
                approach_rate: difficulty.approach_rate,
                overall_difficulty: difficulty.overall_difficulty,
                circle_size: difficulty.circle_size,
            },
        };
    }
}
