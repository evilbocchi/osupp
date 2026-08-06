import { harmonic_difficulty_to_performance } from "../jul2026/Jul2026Skills";
import {
    clamp,
    erf,
    erf_inv,
    lerp,
    logistic,
    reverse_lerp,
    smoothstep,
} from "../utils";
import type { OsuRework } from "./AimSkill";
import {
    sum_jul2026_cognition_difficulty,
    type DifficultyAttributes,
} from "./DifficultyCalculator";
import { flashlight_difficulty_to_performance } from "./FlashlightSkill";

export interface PerformanceAttributes {
    aim: number;
    speed: number;
    accuracy: number;
    flashlight: number;
    reading?: number;
    effective_miss_count: number;
    speed_deviation?: number;
    combo_based_estimated_miss_count: number;
    score_based_estimated_miss_count?: number;
    aim_estimated_slider_breaks: number;
    speed_estimated_slider_breaks: number;
    pp: number;
}

export interface ScoreParams {
    mods: string[];
    accuracy: number;
    combo: number;
    legacy_total_score?: number | null;
    statistics: {
        great: number;
        ok: number;
        meh: number;
        miss: number;
        large_tick_miss?: number;
        slider_tail_hit?: number;
    };
    classic?: boolean;
}

const DIFFICULTY_MULTIPLIER = 0.0675;
const PERFORMANCE_BASE_MULTIPLIER = 1.15;
const SEP2022_PERFORMANCE_BASE_MULTIPLIER = 1.14;
const OCT2025_PERFORMANCE_BASE_MULTIPLIER = 1.14;
const JUL2026_PERFORMANCE_BASE_MULTIPLIER = 1.12;

function difficulty_to_performance(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / DIFFICULTY_MULTIPLIER) - 4) ** 3 / 100000
    );
}

export function calculate_performance(
    difficulty: DifficultyAttributes,
    score: ScoreParams,
    rework: OsuRework = "mar2025",
): PerformanceAttributes {
    const mods = score.mods;
    const accuracy = score.accuracy;
    const score_max_combo = score.combo;
    const count_great = score.statistics.great;
    const count_ok = score.statistics.ok;
    const count_meh = score.statistics.meh;
    const count_miss = score.statistics.miss;
    const count_slider_tick_miss = score.statistics.large_tick_miss ?? 0;
    const count_slider_ends_dropped = Math.max(
        0,
        difficulty.slider_count - (score.statistics.slider_tail_hit ?? 0),
    );
    const total_hits = count_great + count_ok + count_meh + count_miss;
    const total_successful_hits = count_great + count_ok + count_meh;
    const total_imperfect_hits = count_ok + count_meh + count_miss;
    const using_classic_slider_accuracy =
        rework !== "sep2022" && Boolean(score.classic || mods.includes("CL"));

    const overall_difficulty = difficulty.effective_od;
    const approach_rate = difficulty.effective_ar;
    const great_hit_window =
        rework === "oct2025" || rework === "jul2026"
            ? difficulty.hit_window_great
            : 80 - 6 * overall_difficulty;
    const ok_hit_window =
        rework === "oct2025" || rework === "jul2026"
            ? difficulty.hit_window_ok
            : 140 - 8 * overall_difficulty;
    const meh_hit_window =
        rework === "oct2025" || rework === "jul2026"
            ? difficulty.hit_window_meh
            : 200 - 10 * overall_difficulty;

    const combo_based_estimated_miss_count =
        calculate_combo_based_estimated_miss_count(
            difficulty,
            using_classic_slider_accuracy,
            score_max_combo,
            count_miss,
            total_imperfect_hits,
            count_slider_tick_miss,
            count_slider_ends_dropped,
            rework,
        );
    const score_based_estimated_miss_count =
        (rework === "oct2025" || rework === "jul2026") &&
        using_classic_slider_accuracy &&
        score.legacy_total_score != null &&
        score.legacy_total_score > 0
            ? calculate_score_based_estimated_miss_count(
                  difficulty,
                  score,
                  count_great,
                  count_ok,
                  count_meh,
                  count_miss,
                  rework,
              )
            : null;
    let effective_miss_count =
        score_based_estimated_miss_count ?? combo_based_estimated_miss_count;

    effective_miss_count = Math.max(count_miss, effective_miss_count);
    effective_miss_count = Math.min(total_hits, effective_miss_count);

    let multiplier =
        rework === "jul2026"
            ? JUL2026_PERFORMANCE_BASE_MULTIPLIER
            : rework === "oct2025"
              ? OCT2025_PERFORMANCE_BASE_MULTIPLIER
              : rework === "sep2022"
                ? SEP2022_PERFORMANCE_BASE_MULTIPLIER
                : PERFORMANCE_BASE_MULTIPLIER;
    if (mods.includes("NF")) {
        multiplier *= Math.max(0.9, 1 - 0.02 * effective_miss_count);
    }
    if (mods.includes("SO") && total_hits > 0) {
        multiplier *= 1 - (difficulty.spinner_count / total_hits) ** 0.85;
    }

    if (mods.includes("RX")) {
        const ok_multiplier =
            rework === "oct2025"
                ? 0.75 *
                  Math.max(
                      0,
                      overall_difficulty > 0
                          ? 1 - overall_difficulty / 13.33
                          : 1,
                  )
                : Math.max(
                      0,
                      overall_difficulty > 0
                          ? 1 - (overall_difficulty / 13.33) ** 1.8
                          : 1,
                  );
        const meh_multiplier = Math.max(
            0,
            overall_difficulty > 0 ? 1 - (overall_difficulty / 13.33) ** 5 : 1,
        );
        effective_miss_count = Math.min(
            effective_miss_count +
                count_ok * ok_multiplier +
                count_meh * meh_multiplier,
            total_hits,
        );
    }

    const speed_deviation = calculate_speed_deviation(
        difficulty,
        total_hits,
        total_successful_hits,
        count_great,
        count_ok,
        count_meh,
        count_miss,
        great_hit_window,
        ok_hit_window,
        meh_hit_window,
    );

    const aim_value = compute_aim_value(
        difficulty,
        score,
        effective_miss_count,
        total_hits,
        count_ok,
        count_meh,
        total_imperfect_hits,
        count_slider_tick_miss,
        count_slider_ends_dropped,
        using_classic_slider_accuracy,
        accuracy,
        overall_difficulty,
        rework,
    );
    const speed_value = compute_speed_value(
        difficulty,
        score,
        effective_miss_count,
        total_hits,
        count_great,
        count_ok,
        count_meh,
        accuracy,
        overall_difficulty,
        speed_deviation,
        rework,
    );
    const accuracy_value = compute_accuracy_value(
        difficulty,
        mods,
        using_classic_slider_accuracy,
        total_hits,
        count_great,
        count_ok,
        count_meh,
        overall_difficulty,
        rework,
    );
    const flashlight_value = compute_flashlight_value(
        difficulty,
        mods,
        effective_miss_count,
        total_hits,
        score_max_combo,
        accuracy,
        rework,
    );
    const reading_value = compute_reading_value(
        difficulty,
        effective_miss_count,
        accuracy,
        rework,
        aim_value.estimated_slider_breaks,
    );
    const cognition_value =
        rework === "jul2026"
            ? sum_jul2026_cognition_difficulty(reading_value, flashlight_value)
            : flashlight_value;

    const pp =
        (aim_value.value ** 1.1 +
            speed_value.value ** 1.1 +
            accuracy_value ** 1.1 +
            cognition_value ** 1.1) **
            (1 / 1.1) *
        multiplier;

    return {
        aim: aim_value.value,
        speed: speed_value.value,
        accuracy: accuracy_value,
        flashlight: flashlight_value,
        reading: rework === "jul2026" ? reading_value : undefined,
        effective_miss_count: effective_miss_count,
        speed_deviation: speed_deviation ?? undefined,
        combo_based_estimated_miss_count: combo_based_estimated_miss_count,
        score_based_estimated_miss_count:
            score_based_estimated_miss_count ?? undefined,
        aim_estimated_slider_breaks: aim_value.estimated_slider_breaks,
        speed_estimated_slider_breaks: speed_value.estimated_slider_breaks,
        pp,
    };
}

function calculate_combo_based_estimated_miss_count(
    difficulty: DifficultyAttributes,
    using_classic_slider_accuracy: boolean,
    score_max_combo: number,
    count_miss: number,
    total_imperfect_hits: number,
    count_slider_tick_miss: number,
    count_slider_ends_dropped: number,
    rework: OsuRework,
): number {
    if (difficulty.slider_count <= 0) return count_miss;

    if (rework === "sep2022") {
        const full_combo_threshold =
            difficulty.max_combo - 0.1 * difficulty.slider_count;
        const combo_based_miss_count =
            score_max_combo < full_combo_threshold
                ? full_combo_threshold / Math.max(1, score_max_combo)
                : 0;

        return Math.max(
            count_miss,
            Math.min(combo_based_miss_count, total_imperfect_hits),
        );
    }

    let miss_count = count_miss;

    if (using_classic_slider_accuracy) {
        const full_combo_threshold =
            rework === "jul2026"
                ? difficulty.max_combo -
                  Math.min(
                      4 +
                          (0.04 +
                              0.06 *
                                  Math.min(
                                      difficulty.aim_top_weighted_slider_factor,
                                      1,
                                  ) **
                                      2) *
                              difficulty.slider_count,
                      difficulty.slider_count,
                  )
                : difficulty.max_combo - 0.1 * difficulty.slider_count;
        if (score_max_combo < full_combo_threshold) {
            miss_count = full_combo_threshold / Math.max(1, score_max_combo);
        }
        miss_count = Math.min(miss_count, total_imperfect_hits);

        if (rework === "oct2025" || rework === "jul2026") {
            const max_possible_slider_breaks = Math.min(
                difficulty.slider_count,
                (difficulty.max_combo - score_max_combo) / 2,
            );
            const slider_breaks = miss_count - count_miss;

            if (slider_breaks > max_possible_slider_breaks) {
                miss_count = count_miss + max_possible_slider_breaks;
            }
        }
    } else {
        const full_combo_threshold =
            difficulty.max_combo - count_slider_ends_dropped;
        if (score_max_combo < full_combo_threshold) {
            miss_count = full_combo_threshold / Math.max(1, score_max_combo);
        }
        miss_count = Math.min(miss_count, count_slider_tick_miss + count_miss);
    }

    return miss_count;
}

function calculate_score_based_estimated_miss_count(
    difficulty: DifficultyAttributes,
    score: ScoreParams,
    count_great: number,
    count_ok: number,
    count_meh: number,
    count_miss: number,
    rework: OsuRework,
): number {
    if (difficulty.max_combo === 0 || score.legacy_total_score == null)
        return 0;

    const score_v1_multiplier =
        difficulty.legacy_score_base_multiplier *
        get_legacy_score_multiplier(score.mods);
    const relevant_combo_per_object =
        calculate_relevant_score_combo_per_object(difficulty);
    const maximum_miss_count = calculate_maximum_combo_based_miss_count(
        difficulty,
        score.combo,
        count_miss,
        count_ok + count_meh + count_miss,
        rework,
    );
    const score_obtained_during_max_combo = calculate_score_at_combo(
        score.combo,
        relevant_combo_per_object,
        score_v1_multiplier,
        score.accuracy,
        difficulty,
        count_great,
        count_ok,
        count_meh,
        count_miss,
    );
    const remaining_score =
        score.legacy_total_score - score_obtained_during_max_combo;

    if (remaining_score <= 0) return maximum_miss_count;

    const remaining_combo = difficulty.max_combo - score.combo;
    const expected_remaining_score = calculate_score_at_combo(
        remaining_combo,
        relevant_combo_per_object,
        score_v1_multiplier,
        score.accuracy,
        difficulty,
        count_great,
        count_ok,
        count_meh,
        count_miss,
    );

    const score_based_miss_count = Math.max(
        expected_remaining_score / remaining_score,
        1,
    );

    return Math.min(score_based_miss_count, maximum_miss_count);
}

function calculate_maximum_combo_based_miss_count(
    difficulty: DifficultyAttributes,
    score_max_combo: number,
    count_miss: number,
    total_imperfect_hits: number,
    rework: OsuRework,
): number {
    if (difficulty.slider_count <= 0) return count_miss;

    let miss_count = 0;
    const full_combo_threshold =
        rework === "jul2026"
            ? difficulty.max_combo -
              Math.min(
                  4 +
                      (0.04 +
                          0.06 *
                              Math.min(
                                  difficulty.aim_top_weighted_slider_factor,
                                  1,
                              ) **
                                  2) *
                          difficulty.slider_count,
                  difficulty.slider_count,
              )
            : difficulty.max_combo - 0.1 * difficulty.slider_count;

    if (score_max_combo < full_combo_threshold) {
        miss_count =
            (full_combo_threshold / Math.max(1, score_max_combo)) ** 2.5;
    }

    miss_count = Math.min(miss_count, total_imperfect_hits);

    const max_possible_slider_breaks = Math.min(
        difficulty.slider_count,
        (difficulty.max_combo - score_max_combo) / 2,
    );
    const slider_breaks = miss_count - count_miss;

    if (slider_breaks > max_possible_slider_breaks) {
        miss_count = count_miss + max_possible_slider_breaks;
    }

    return miss_count;
}

function calculate_score_at_combo(
    combo: number,
    relevant_combo_per_object: number,
    score_v1_multiplier: number,
    accuracy: number,
    difficulty: DifficultyAttributes,
    count_great: number,
    count_ok: number,
    count_meh: number,
    count_miss: number,
): number {
    const total_hits = count_great + count_ok + count_meh + count_miss;
    const estimated_objects = combo / relevant_combo_per_object - 1;
    let combo_score =
        relevant_combo_per_object > 0
            ? ((2 * (relevant_combo_per_object - 1) +
                  (estimated_objects - 1) * relevant_combo_per_object) *
                  estimated_objects) /
              2
            : 0;

    combo_score *= accuracy * (300 / 25) * score_v1_multiplier;

    const objects_hit =
        ((total_hits - count_miss) * combo) / difficulty.max_combo;
    const non_combo_score =
        (300 + difficulty.nested_score_per_object) * accuracy * objects_hit;

    return combo_score + non_combo_score;
}

function calculate_relevant_score_combo_per_object(
    difficulty: DifficultyAttributes,
): number {
    let combo_score = difficulty.maximum_legacy_combo_score;
    combo_score /= (300 / 25) * difficulty.legacy_score_base_multiplier;

    let result = (difficulty.max_combo - 2) * difficulty.max_combo;
    result /= Math.max(difficulty.max_combo + 2 * (combo_score - 1), 1);

    return result;
}

function get_legacy_score_multiplier(mods: string[]): number {
    let multiplier = 1;

    for (const mod of mods) {
        switch (mod) {
            case "NF":
            case "EZ":
                multiplier *= 0.5;
                break;
            case "HT":
                multiplier *= 0.3;
                break;
            case "HD":
                multiplier *= 1.06;
                break;
            case "HR":
                multiplier *= 1.06;
                break;
            case "DT":
            case "NC":
                multiplier *= 1.12;
                break;
            case "FL":
                multiplier *= 1.12;
                break;
            case "SO":
                multiplier *= 0.9;
                break;
            case "RX":
            case "AP":
                return 0;
        }
    }

    return multiplier;
}

function compute_aim_value(
    difficulty: DifficultyAttributes,
    score: ScoreParams,
    effective_miss_count: number,
    total_hits: number,
    count_ok: number,
    count_meh: number,
    total_imperfect_hits: number,
    count_slider_tick_miss: number,
    count_slider_ends_dropped: number,
    using_classic_slider_accuracy: boolean,
    accuracy: number,
    overall_difficulty: number,
    rework: OsuRework,
): { value: number; estimated_slider_breaks: number } {
    const mods = score.mods;
    if (mods.includes("AP")) return { value: 0, estimated_slider_breaks: 0 };

    let aim_difficulty = difficulty.aim_difficulty;

    if (
        rework !== "oct2024" &&
        difficulty.slider_count > 0 &&
        difficulty.aim_difficult_slider_count > 0
    ) {
        const estimate_improperly_followed_difficult_sliders =
            using_classic_slider_accuracy
                ? clamp(
                      Math.min(
                          total_imperfect_hits,
                          difficulty.max_combo - score.combo,
                      ),
                      0,
                      difficulty.aim_difficult_slider_count,
                  )
                : clamp(
                      count_slider_ends_dropped + count_slider_tick_miss,
                      0,
                      difficulty.aim_difficult_slider_count,
                  );

        const slider_nerf_factor =
            (1 - difficulty.slider_factor) *
                (1 -
                    estimate_improperly_followed_difficult_sliders /
                        difficulty.aim_difficult_slider_count) **
                    3 +
            difficulty.slider_factor;
        aim_difficulty *= slider_nerf_factor;
    }

    let aim_value =
        rework === "jul2026"
            ? harmonic_difficulty_to_performance(aim_difficulty)
            : difficulty_to_performance(aim_difficulty);
    const length_bonus =
        0.95 +
        (rework === "jul2026" ? 0.35 : 0.4) * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
    aim_value *= length_bonus;

    if (effective_miss_count > 0) {
        const estimated_slider_breaks =
            rework === "oct2025" || rework === "jul2026"
                ? calculate_estimated_slider_breaks(
                      difficulty.aim_top_weighted_slider_factor,
                      difficulty,
                      score,
                      effective_miss_count,
                      count_ok,
                      rework === "jul2026" ? count_meh : 0,
                      using_classic_slider_accuracy,
                      rework,
                  )
                : 0;
        const relevant_miss_count =
            rework === "oct2025" || rework === "jul2026"
                ? Math.min(
                      effective_miss_count + estimated_slider_breaks,
                      total_imperfect_hits + count_slider_tick_miss,
                  )
                : effective_miss_count;

        aim_value *= calculate_miss_penalty(
            relevant_miss_count,
            difficulty.aim_difficult_strain_count,
            total_hits,
            rework,
            rework === "sep2022" ? effective_miss_count : undefined,
        );
    }

    if (rework === "sep2022") {
        aim_value *= combo_scaling_factor(difficulty, score.combo);
    }

    if (rework !== "oct2025" && rework !== "jul2026") {
        let approach_rate_factor = 0;
        if (difficulty.effective_ar > 10.33)
            approach_rate_factor = 0.3 * (difficulty.effective_ar - 10.33);
        else if (difficulty.effective_ar < 8)
            approach_rate_factor = 0.05 * (8 - difficulty.effective_ar);
        if (mods.includes("RX")) approach_rate_factor = 0;

        aim_value *= 1 + approach_rate_factor * length_bonus;
    }

    if (mods.includes("BL")) {
        aim_value *=
            1.3 +
            total_hits *
                (0.0016 / (1 + 2 * effective_miss_count)) *
                accuracy ** 16 *
                (1 - 0.003 * difficulty.drain_rate ** 2);
    } else if (
        (rework === "oct2025" || rework === "jul2026") &&
        mods.includes("TC")
    ) {
        aim_value *=
            1 +
            calculate_visibility_bonus(
                mods,
                difficulty.effective_ar,
                1,
                difficulty.slider_factor,
            );
    } else if (
        rework !== "oct2025" &&
        rework !== "jul2026" &&
        (mods.includes("HD") || mods.includes("TC"))
    ) {
        aim_value *= 1 + 0.04 * (12 - difficulty.effective_ar);
    }

    if (
        (rework === "oct2024" || rework === "sep2022") &&
        difficulty.slider_count > 0
    ) {
        const estimate_difficult_sliders = difficulty.slider_count * 0.15;
        const estimate_improperly_followed_difficult_sliders =
            using_classic_slider_accuracy
                ? clamp(
                      Math.min(
                          total_imperfect_hits,
                          difficulty.max_combo - score.combo,
                      ),
                      0,
                      estimate_difficult_sliders,
                  )
                : rework === "sep2022"
                  ? clamp(
                        Math.min(
                            total_imperfect_hits,
                            difficulty.max_combo - score.combo,
                        ),
                        0,
                        estimate_difficult_sliders,
                    )
                  : clamp(
                        count_slider_ends_dropped + count_slider_tick_miss,
                        0,
                        estimate_difficult_sliders,
                    );

        const slider_nerf_factor =
            (1 - difficulty.slider_factor) *
                (1 -
                    estimate_improperly_followed_difficult_sliders /
                        estimate_difficult_sliders) **
                    3 +
            difficulty.slider_factor;
        aim_value *= slider_nerf_factor;
    }

    aim_value *= accuracy;
    if (rework !== "oct2025" && rework !== "jul2026") {
        aim_value *=
            0.98 +
            (rework === "oct2024"
                ? overall_difficulty ** 2
                : Math.max(0, overall_difficulty) ** 2) /
                2500;
    }

    return {
        value: aim_value,
        estimated_slider_breaks:
            (rework === "oct2025" || rework === "jul2026") &&
            effective_miss_count > 0
                ? calculate_estimated_slider_breaks(
                      difficulty.aim_top_weighted_slider_factor,
                      difficulty,
                      score,
                      effective_miss_count,
                      count_ok,
                      rework === "jul2026" ? count_meh : 0,
                      using_classic_slider_accuracy,
                      rework,
                  )
                : 0,
    };
}

function compute_speed_value(
    difficulty: DifficultyAttributes,
    score: ScoreParams,
    effective_miss_count: number,
    total_hits: number,
    count_great: number,
    count_ok: number,
    count_meh: number,
    accuracy: number,
    overall_difficulty: number,
    speed_deviation: number | null,
    rework: OsuRework,
): { value: number; estimated_slider_breaks: number } {
    const mods = score.mods;
    if (
        mods.includes("RX") ||
        (rework !== "oct2024" &&
            rework !== "sep2022" &&
            speed_deviation == null)
    )
        return { value: 0, estimated_slider_breaks: 0 };

    let speed_value =
        rework === "jul2026"
            ? harmonic_difficulty_to_performance(difficulty.speed_difficulty)
            : difficulty_to_performance(difficulty.speed_difficulty);
    const length_bonus =
        0.95 +
        0.4 * Math.min(1, total_hits / 2000) +
        (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
    if (rework !== "jul2026") speed_value *= length_bonus;

    if (effective_miss_count > 0) {
        const estimated_slider_breaks =
            rework === "oct2025" || rework === "jul2026"
                ? calculate_estimated_slider_breaks(
                      difficulty.speed_top_weighted_slider_factor,
                      difficulty,
                      score,
                      effective_miss_count,
                      count_ok,
                      rework === "jul2026" ? count_meh : 0,
                      mods.includes("CL") || Boolean(score.classic),
                      rework,
                  )
                : 0;
        const relevant_miss_count =
            rework === "oct2025" || rework === "jul2026"
                ? Math.min(
                      effective_miss_count + estimated_slider_breaks,
                      count_ok + count_meh + score.statistics.miss,
                  )
                : effective_miss_count;

        speed_value *= calculate_miss_penalty(
            relevant_miss_count,
            difficulty.speed_difficult_strain_count,
            total_hits,
            rework,
            rework === "sep2022" ? effective_miss_count ** 0.875 : undefined,
        );
    }

    if (rework === "sep2022") {
        speed_value *= combo_scaling_factor(difficulty, score.combo);
    }

    if (rework !== "oct2025" && rework !== "jul2026") {
        let approach_rate_factor = 0;
        if (difficulty.effective_ar > 10.33)
            approach_rate_factor = 0.3 * (difficulty.effective_ar - 10.33);
        if (mods.includes("AP")) approach_rate_factor = 0;

        speed_value *= 1 + approach_rate_factor * length_bonus;
    }

    if (mods.includes("BL")) speed_value *= 1.12;
    else if (
        (rework === "oct2025" || rework === "jul2026") &&
        mods.includes("TC")
    ) {
        speed_value *=
            1 + calculate_visibility_bonus(mods, difficulty.effective_ar);
    } else if (
        rework !== "oct2025" &&
        rework !== "jul2026" &&
        (mods.includes("HD") || mods.includes("TC"))
    ) {
        speed_value *= 1 + 0.04 * (12 - difficulty.effective_ar);
    }

    if (
        rework !== "oct2024" &&
        rework !== "sep2022" &&
        speed_deviation != null
    ) {
        speed_value *= calculate_speed_high_deviation_nerf(
            difficulty,
            speed_deviation,
            rework,
        );
    }
    if (rework === "jul2026" && speed_deviation != null) {
        const effective_hit_window =
            20 * (4 / difficulty.speed_difficulty) ** 0.35;
        const effective_accuracy = erf(effective_hit_window / speed_deviation);
        speed_value *= effective_accuracy ** 2;
    } else if (rework !== "jul2026") {
        speed_value = apply_speed_accuracy_scaling(
            speed_value,
            difficulty,
            total_hits,
            count_great,
            count_ok,
            count_meh,
            accuracy,
            overall_difficulty,
            rework,
        );
    }

    if (rework === "oct2024" || rework === "sep2022") {
        speed_value *=
            0.99 **
            (count_meh < total_hits / 500 ? 0 : count_meh - total_hits / 500);
    }

    return {
        value: speed_value,
        estimated_slider_breaks:
            (rework === "oct2025" || rework === "jul2026") &&
            effective_miss_count > 0
                ? calculate_estimated_slider_breaks(
                      difficulty.speed_top_weighted_slider_factor,
                      difficulty,
                      score,
                      effective_miss_count,
                      count_ok,
                      rework === "jul2026" ? count_meh : 0,
                      mods.includes("CL") || Boolean(score.classic),
                      rework,
                  )
                : 0,
    };
}

function apply_speed_accuracy_scaling(
    speed_value: number,
    difficulty: DifficultyAttributes,
    total_hits: number,
    count_great: number,
    count_ok: number,
    count_meh: number,
    accuracy: number,
    overall_difficulty: number,
    rework: OsuRework,
): number {
    const relevant_total_diff =
        rework === "oct2024"
            ? total_hits - difficulty.speed_note_count
            : Math.max(0, total_hits - difficulty.speed_note_count);
    const relevant_count_great = Math.max(0, count_great - relevant_total_diff);
    const relevant_count_ok = Math.max(
        0,
        count_ok - Math.max(0, relevant_total_diff - count_great),
    );
    const relevant_count_meh = Math.max(
        0,
        count_meh - Math.max(0, relevant_total_diff - count_great - count_ok),
    );
    const relevant_accuracy =
        difficulty.speed_note_count === 0
            ? 0
            : (relevant_count_great * 6 +
                  relevant_count_ok * 2 +
                  relevant_count_meh) /
              (difficulty.speed_note_count * 6);

    return (
        speed_value *
        (rework === "oct2025"
            ? 1
            : 0.95 +
              (rework === "oct2024"
                  ? overall_difficulty ** 2
                  : Math.max(0, overall_difficulty) ** 2) /
                  750) *
        ((accuracy + relevant_accuracy) / 2) **
            ((14.5 - overall_difficulty) / 2)
    );
}

function compute_accuracy_value(
    difficulty: DifficultyAttributes,
    mods: string[],
    using_classic_slider_accuracy: boolean,
    total_hits: number,
    count_great: number,
    count_ok: number,
    count_meh: number,
    overall_difficulty: number,
    rework: OsuRework,
): number {
    if (mods.includes("RX")) return 0;

    let amount_hit_objects_with_accuracy = difficulty.hit_circle_count;
    if (rework !== "sep2022" && !using_classic_slider_accuracy)
        amount_hit_objects_with_accuracy += difficulty.slider_count;

    const better_accuracy_percentage =
        amount_hit_objects_with_accuracy > 0
            ? Math.max(
                  0,
                  ((count_great -
                      (rework === "oct2024"
                          ? total_hits - amount_hit_objects_with_accuracy
                          : Math.max(
                                total_hits - amount_hit_objects_with_accuracy,
                                0,
                            ))) *
                      6 +
                      count_ok * 2 +
                      count_meh) /
                      (amount_hit_objects_with_accuracy * 6),
              )
            : 0;

    let accuracy_value =
        1.52163 ** overall_difficulty * better_accuracy_percentage ** 24 * 2.83;
    accuracy_value *=
        rework === "jul2026" && amount_hit_objects_with_accuracy >= 1000
            ? (amount_hit_objects_with_accuracy / 1000) ** 0.1
            : Math.min(
                  rework === "jul2026" ? Number.POSITIVE_INFINITY : 1.15,
                  (amount_hit_objects_with_accuracy / 1000) ** 0.3,
              );

    if (mods.includes("BL")) accuracy_value *= 1.14;
    else if (
        mods.includes("TC") ||
        (rework !== "jul2026" && mods.includes("HD"))
    ) {
        accuracy_value *=
            rework === "oct2025" || rework === "jul2026"
                ? 1 + 0.08 * reverse_lerp(difficulty.effective_ar, 11.5, 10)
                : 1.08;
    }
    if (mods.includes("FL") && rework !== "jul2026") accuracy_value *= 1.02;

    return accuracy_value;
}

function compute_flashlight_value(
    difficulty: DifficultyAttributes,
    mods: string[],
    effective_miss_count: number,
    total_hits: number,
    score_max_combo: number,
    accuracy: number,
    rework: OsuRework,
): number {
    if (!mods.includes("FL")) return 0;

    let flashlight_value = flashlight_difficulty_to_performance(
        difficulty.flashlight_difficulty,
    );

    if (effective_miss_count > 0) {
        flashlight_value *=
            0.97 *
            (1 - (effective_miss_count / total_hits) ** 0.775) **
                (effective_miss_count ** 0.875);
    }

    flashlight_value *=
        difficulty.max_combo <= 0
            ? 1
            : Math.min(score_max_combo ** 0.8 / difficulty.max_combo ** 0.8, 1);
    if (rework !== "oct2025" && rework !== "jul2026") {
        flashlight_value *=
            0.7 +
            0.1 * Math.min(1, total_hits / 200) +
            (total_hits > 200
                ? 0.2 * Math.min(1, (total_hits - 200) / 200)
                : 0);
    }
    flashlight_value *= 0.5 + accuracy / 2;
    if (rework !== "oct2025" && rework !== "jul2026") {
        flashlight_value *=
            0.98 +
            (rework === "oct2024"
                ? difficulty.effective_od ** 2
                : Math.max(0, difficulty.effective_od) ** 2) /
                2500;
    }

    return flashlight_value;
}

function compute_reading_value(
    difficulty: DifficultyAttributes,
    effective_miss_count: number,
    accuracy: number,
    rework: OsuRework,
    aim_estimated_slider_breaks: number,
): number {
    if (rework !== "jul2026") return 0;

    let reading_value = harmonic_difficulty_to_performance(
        difficulty.reading_difficulty,
    );

    if (effective_miss_count > 0) {
        reading_value *= calculate_miss_penalty(
            effective_miss_count + aim_estimated_slider_breaks,
            difficulty.reading_difficult_note_count,
            difficulty.reading_difficult_note_count,
            rework,
        );
    }

    reading_value *= accuracy ** 3;

    return reading_value;
}

function calculate_speed_deviation(
    difficulty: DifficultyAttributes,
    total_hits: number,
    total_successful_hits: number,
    count_great: number,
    count_ok: number,
    count_meh: number,
    count_miss: number,
    great_hit_window: number,
    ok_hit_window: number,
    meh_hit_window: number,
): number | null {
    if (total_successful_hits === 0) return null;

    let speed_note_count = difficulty.speed_note_count;
    speed_note_count += (total_hits - difficulty.speed_note_count) * 0.1;

    const relevant_count_miss = Math.min(count_miss, speed_note_count);
    const relevant_count_meh = Math.min(
        count_meh,
        speed_note_count - relevant_count_miss,
    );
    const relevant_count_ok = Math.min(
        count_ok,
        speed_note_count - relevant_count_miss - relevant_count_meh,
    );
    const relevant_count_great = Math.max(
        0,
        speed_note_count -
            relevant_count_miss -
            relevant_count_meh -
            relevant_count_ok,
    );

    return calculate_deviation(
        relevant_count_great,
        relevant_count_ok,
        relevant_count_meh,
        great_hit_window,
        ok_hit_window,
        meh_hit_window,
    );
}

function calculate_deviation(
    relevant_count_great: number,
    relevant_count_ok: number,
    relevant_count_meh: number,
    great_hit_window: number,
    ok_hit_window: number,
    meh_hit_window: number,
): number | null {
    if (relevant_count_great + relevant_count_ok + relevant_count_meh <= 0)
        return null;

    const n = Math.max(1, relevant_count_great + relevant_count_ok);
    const z = 2.32634787404;
    const p = relevant_count_great / n;
    const p_lower_bound = Math.min(
        p,
        (n * p + (z * z) / 2) / (n + z * z) -
            (z / (n + z * z)) * Math.sqrt(n * p * (1 - p) + (z * z) / 4),
    );

    let deviation: number;
    if (p_lower_bound > 0.01) {
        deviation = great_hit_window / (Math.sqrt(2) * erf_inv(p_lower_bound));
        const ok_hit_window_tail_amount =
            (Math.sqrt(2 / Math.PI) *
                ok_hit_window *
                Math.exp(-0.5 * (ok_hit_window / deviation) ** 2)) /
            (deviation * erf(ok_hit_window / (Math.sqrt(2) * deviation)));

        deviation *= Math.sqrt(1 - ok_hit_window_tail_amount);
    } else {
        deviation = ok_hit_window / Math.sqrt(3);
    }

    const meh_variance =
        (meh_hit_window * meh_hit_window +
            ok_hit_window * meh_hit_window +
            ok_hit_window * ok_hit_window) /
        3;

    return Math.sqrt(
        ((relevant_count_great + relevant_count_ok) * deviation ** 2 +
            relevant_count_meh * meh_variance) /
            (relevant_count_great + relevant_count_ok + relevant_count_meh),
    );
}

function calculate_speed_high_deviation_nerf(
    difficulty: DifficultyAttributes,
    speed_deviation: number,
    rework: OsuRework,
): number {
    const speed_value =
        rework === "jul2026"
            ? harmonic_difficulty_to_performance(difficulty.speed_difficulty)
            : difficulty_to_performance(difficulty.speed_difficulty);
    const excess_speed_difficulty_cutoff =
        100 + 220 * (22 / speed_deviation) ** 6.5;

    if (speed_value <= excess_speed_difficulty_cutoff) return 1;

    const scale = 50;
    let adjusted_speed_value =
        scale *
        (Math.log((speed_value - excess_speed_difficulty_cutoff) / scale + 1) +
            excess_speed_difficulty_cutoff / scale);
    const amount = 1 - reverse_lerp(speed_deviation, 22, 27);
    adjusted_speed_value = lerp(adjusted_speed_value, speed_value, amount);

    return adjusted_speed_value / speed_value;
}

function calculate_estimated_slider_breaks(
    top_weighted_slider_factor: number,
    difficulty: DifficultyAttributes,
    score: ScoreParams,
    effective_miss_count: number,
    count_ok: number,
    count_meh: number,
    using_classic_slider_accuracy: boolean,
    rework: OsuRework,
): number {
    const non_miss_mistakes =
        rework === "jul2026" ? count_ok + count_meh : count_ok;
    if (!using_classic_slider_accuracy || non_miss_mistakes === 0) return 0;

    const missed_combo_percent = 1 - score.combo / difficulty.max_combo;
    let estimated_slider_breaks = Math.min(
        non_miss_mistakes,
        effective_miss_count * top_weighted_slider_factor,
    );
    const ok_adjustment =
        rework === "jul2026"
            ? (non_miss_mistakes - estimated_slider_breaks + 4.5) /
              (non_miss_mistakes + 4)
            : (count_ok - estimated_slider_breaks + 0.5) / count_ok;

    estimated_slider_breaks *= smoothstep(effective_miss_count, 1, 2);

    return (
        estimated_slider_breaks *
        ok_adjustment *
        logistic(missed_combo_percent, 0.33, 15)
    );
}

function calculate_visibility_bonus(
    mods: string[],
    approach_rate: number,
    visibility_factor = 1,
    slider_factor = 1,
): number {
    const is_always_partially_visible = mods.includes("TC");
    let reading_bonus = 0.04 * (12 - Math.max(approach_rate, 7));
    reading_bonus *= visibility_factor;

    const slider_visibility_factor = slider_factor ** 3;

    if (approach_rate < 7) {
        reading_bonus +=
            (is_always_partially_visible ? 0.03 : 0.045) *
            (7 - Math.max(approach_rate, 0)) *
            slider_visibility_factor;
    }

    if (approach_rate < 0) {
        reading_bonus +=
            (is_always_partially_visible ? 0.075 : 0.1) *
            (1 - 1.5 ** approach_rate) *
            slider_visibility_factor;
    }

    return reading_bonus;
}

function calculate_miss_penalty(
    miss_count: number,
    difficult_strain_count: number,
    total_hits = difficult_strain_count,
    rework?: OsuRework,
    miss_exponent?: number,
): number {
    if (rework === "sep2022") {
        return (
            0.97 *
            (1 - (miss_count / total_hits) ** 0.775) **
                (miss_exponent ?? 1)
        );
    }

    if (rework === "jul2026") {
        return 0.93 / (miss_count / (4 * Math.log(difficult_strain_count)) + 1);
    }

    return (
        0.96 / (miss_count / (4 * Math.log(difficult_strain_count) ** 0.94) + 1)
    );
}

function combo_scaling_factor(
    difficulty: DifficultyAttributes,
    score_max_combo: number,
): number {
    return difficulty.max_combo <= 0
        ? 1
        : Math.min(score_max_combo ** 0.8 / difficulty.max_combo ** 0.8, 1);
}
