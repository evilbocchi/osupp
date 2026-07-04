import type { BeatmapData, HitObject } from "../BeatmapData";
import { apply_osu_stacking, point_at_slider_path } from "../BeatmapData";
import {
    clamp,
    difficulty_range,
    lerp,
    osu_hit_window,
    reverse_lerp,
} from "../utils";
import {
    calculate_aim_skill,
    count_top_weighted_sliders as count_aim_top_weighted_sliders,
    type OsuRework,
} from "./AimSkill";
import {
    calculate_flashlight_skill,
    flashlight_difficulty_to_performance,
} from "./FlashlightSkill";
import { OsuDifficultyHitObject } from "./OsuDifficultyHitObject";
import {
    calculate_speed_skill,
    count_top_weighted_sliders as count_speed_top_weighted_sliders,
} from "./SpeedSkill";

export interface DifficultyAttributes {
    star_rating: number;
    max_combo: number;
    aim_difficulty: number;
    aim_difficult_slider_count: number;
    speed_difficulty: number;
    speed_note_count: number;
    flashlight_difficulty: number;
    slider_factor: number;
    aim_difficult_strain_count: number;
    speed_difficult_strain_count: number;
    aim_top_weighted_slider_factor: number;
    speed_top_weighted_slider_factor: number;
    approach_rate: number;
    overall_difficulty: number;
    circle_size: number;
    hit_circle_count: number;
    slider_count: number;
    spinner_count: number;
    total_hits: number;
    effective_ar: number;
    effective_od: number;
    hit_window_great: number;
    hit_window_ok: number;
    hit_window_meh: number;
    drain_rate: number;
    nested_score_per_object: number;
    legacy_score_base_multiplier: number;
    maximum_legacy_combo_score: number;
}

const DIFFICULTY_MULTIPLIER = 0.0675;
const PERFORMANCE_BASE_MULTIPLIER = 1.15;
const OCT2025_PERFORMANCE_BASE_MULTIPLIER = 1.14;
const STAR_RATING_MULTIPLIER = 0.027;
const OCT2025_STAR_RATING_MULTIPLIER = 0.0265;

export function apply_mods_to_difficulty(
    beatmap: BeatmapData,
    mods: string[],
): {
    clock_rate: number;
    ar: number;
    od: number;
    cs: number;
    hp: number;
} {
    let clock_rate = 1;

    if (mods.includes("DT") || mods.includes("NC")) clock_rate = 1.5;
    else if (mods.includes("HT")) clock_rate = 0.75;

    let ar = Math.fround(beatmap.ar);
    let od = Math.fround(beatmap.od);
    let cs = Math.fround(beatmap.cs);
    let hp = Math.fround(beatmap.hp);

    if (mods.includes("HR")) {
        ar = Math.fround(Math.min(10, ar * 1.4));
        od = Math.fround(Math.min(10, od * 1.4));
        cs = Math.fround(Math.min(10, cs * 1.3));
        hp = Math.fround(Math.min(10, hp * 1.4));
    }

    if (mods.includes("EZ")) {
        ar = Math.fround(ar * 0.5);
        od = Math.fround(od * 0.5);
        cs = Math.fround(cs * 0.5);
        hp = Math.fround(hp * 0.5);
    }

    return { clock_rate, ar, od, cs, hp };
}

export function calculate_effective_arod(
    ar: number,
    od: number,
    clock_rate: number,
    rework: OsuRework = "mar2025",
): { effective_ar: number; effective_od: number } {
    const great_hit_window =
        (rework === "oct2025" ? osu_hit_window(od, 80, 50, 20) : 80 - 6 * od) /
        clock_rate;
    const preempt = difficulty_range(ar, 1800, 1200, 450) / clock_rate;

    return {
        effective_od:
            rework === "oct2025"
                ? (79.5 - great_hit_window) / 6
                : (80 - great_hit_window) / 6,
        effective_ar:
            preempt > 1200
                ? (1800 - preempt) / 120
                : (1200 - preempt) / 150 + 5,
    };
}

function difficulty_to_performance(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / DIFFICULTY_MULTIPLIER) - 4) ** 3 / 100000
    );
}

function calculate_difficulty_rating(difficulty_value: number): number {
    return Math.sqrt(difficulty_value) * DIFFICULTY_MULTIPLIER;
}

function calculate_star_rating(
    base_performance: number,
    rework: OsuRework,
): number {
    const performance_base_multiplier =
        rework === "oct2025"
            ? OCT2025_PERFORMANCE_BASE_MULTIPLIER
            : PERFORMANCE_BASE_MULTIPLIER;
    const star_rating_multiplier =
        rework === "oct2025"
            ? OCT2025_STAR_RATING_MULTIPLIER
            : STAR_RATING_MULTIPLIER;

    return base_performance > 0.00001
        ? Math.cbrt(performance_base_multiplier) *
              star_rating_multiplier *
              (Math.cbrt((100000 / 2 ** (1 / 1.1)) * base_performance) + 4)
        : 0;
}

function compute_aim_rating(
    difficulty_value: number,
    mods: string[],
    total_hits: number,
    approach_rate: number,
    overall_difficulty: number,
    mechanical_difficulty_rating: number,
    slider_factor: number,
    rework: OsuRework,
): number {
    if (mods.includes("AP")) return 0;

    let aim_rating = calculate_difficulty_rating(difficulty_value);
    if (mods.includes("TD")) aim_rating = aim_rating ** 0.8;
    if (mods.includes("RX")) aim_rating *= 0.9;

    if (rework === "oct2025") {
        let rating_multiplier = 1;
        const approach_rate_length_bonus =
            0.95 +
            0.4 * Math.min(1, total_hits / 2000) +
            (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);

        let approach_rate_factor = 0;
        if (approach_rate > 10.33)
            approach_rate_factor = 0.3 * (approach_rate - 10.33);
        else if (approach_rate < 8)
            approach_rate_factor = 0.05 * (8 - approach_rate);

        if (mods.includes("RX")) approach_rate_factor = 0;

        rating_multiplier += approach_rate_factor * approach_rate_length_bonus;

        if (mods.includes("HD")) {
            const mechanical_difficulty_factor = reverse_lerp(
                mechanical_difficulty_rating,
                5,
                10,
            );
            const ar_factor_starting_point = lerp(
                9,
                10.33,
                mechanical_difficulty_factor,
            );
            const visibility_factor = reverse_lerp(
                approach_rate,
                11.5,
                ar_factor_starting_point,
            );
            rating_multiplier += calculate_visibility_bonus(
                mods,
                approach_rate,
                visibility_factor,
                slider_factor,
            );
        }

        rating_multiplier *= 0.98 + Math.max(0, overall_difficulty) ** 2 / 2500;

        return aim_rating * Math.cbrt(rating_multiplier);
    }

    return aim_rating;
}

function compute_speed_rating(
    difficulty_value: number,
    mods: string[],
    total_hits: number,
    approach_rate: number,
    overall_difficulty: number,
    mechanical_difficulty_rating: number,
    rework: OsuRework,
): number {
    if (mods.includes("RX")) return 0;

    let speed_rating = calculate_difficulty_rating(difficulty_value);
    if (mods.includes("AP")) speed_rating *= 0.5;

    if (rework === "oct2025") {
        let rating_multiplier = 1;
        const approach_rate_length_bonus =
            0.95 +
            0.4 * Math.min(1, total_hits / 2000) +
            (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);

        let approach_rate_factor = 0;
        if (approach_rate > 10.33)
            approach_rate_factor = 0.3 * (approach_rate - 10.33);
        if (mods.includes("AP")) approach_rate_factor = 0;

        rating_multiplier += approach_rate_factor * approach_rate_length_bonus;

        if (mods.includes("HD")) {
            const mechanical_difficulty_factor = reverse_lerp(
                mechanical_difficulty_rating,
                5,
                10,
            );
            const ar_factor_starting_point = lerp(
                10,
                10.33,
                mechanical_difficulty_factor,
            );
            const visibility_factor = reverse_lerp(
                approach_rate,
                11.5,
                ar_factor_starting_point,
            );
            rating_multiplier += calculate_visibility_bonus(
                mods,
                approach_rate,
                visibility_factor,
            );
        }

        rating_multiplier *= 0.95 + Math.max(0, overall_difficulty) ** 2 / 750;

        return speed_rating * Math.cbrt(rating_multiplier);
    }

    return speed_rating;
}

function compute_flashlight_rating(
    difficulty_value: number,
    mods: string[],
    total_hits: number,
    overall_difficulty: number,
    rework: OsuRework,
): number {
    if (!mods.includes("FL")) return 0;

    let flashlight_rating = calculate_difficulty_rating(difficulty_value);
    if (mods.includes("TD")) flashlight_rating = flashlight_rating ** 0.8;
    if (mods.includes("RX")) flashlight_rating *= 0.7;
    else if (mods.includes("AP")) flashlight_rating *= 0.4;

    if (rework === "oct2025") {
        let rating_multiplier =
            0.7 +
            0.1 * Math.min(1, total_hits / 200) +
            (total_hits > 200
                ? 0.2 * Math.min(1, (total_hits - 200) / 200)
                : 0);
        rating_multiplier *= 0.98 + Math.max(0, overall_difficulty) ** 2 / 2500;

        return flashlight_rating * Math.sqrt(rating_multiplier);
    }

    return flashlight_rating;
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

function calculate_difficulty_peppy_stars(
    beatmap: BeatmapData,
    hp: number,
    od: number,
    cs: number,
): number {
    const object_count = beatmap.hit_objects.length;
    const drain_length =
        object_count > 0
            ? Math.trunc(
                  (Math.round(beatmap.hit_objects[object_count - 1]!.time) -
                      Math.round(beatmap.hit_objects[0]!.time) -
                      beatmap.breaks.reduce(
                          (sum, break_period) =>
                              sum +
                              (Math.round(break_period.end_time) -
                                  Math.round(break_period.start_time)),
                          0,
                      )) /
                      1000,
              )
            : 0;
    const object_to_drain_ratio =
        drain_length !== 0
            ? clamp((object_count / drain_length) * 8, 0, 16)
            : 16;

    return Math.round(((hp + od + cs + object_to_drain_ratio) / 38) * 5);
}

function calculate_spinner_score(hit_object: HitObject): number {
    const SPIN_SCORE = 100;
    const BONUS_SPIN_SCORE = 1000;
    const MAXIMUM_ROTATIONS_PER_SECOND = 477 / 60;
    const MINIMUM_ROTATIONS_PER_SECOND = 3;

    const seconds_duration = (hit_object.end_time - hit_object.time) / 1000;
    const total_half_spins_possible = Math.trunc(
        seconds_duration * MAXIMUM_ROTATIONS_PER_SECOND * 2,
    );
    const half_spins_required_for_completion = Math.trunc(
        seconds_duration * MINIMUM_ROTATIONS_PER_SECOND,
    );
    const half_spins_required_before_bonus =
        half_spins_required_for_completion + 3;

    const full_spins = Math.trunc(total_half_spins_possible / 2);
    let score = SPIN_SCORE * full_spins;

    let bonus_spins = Math.trunc(
        (total_half_spins_possible - half_spins_required_before_bonus) / 2,
    );
    bonus_spins = Math.max(0, bonus_spins - Math.trunc(full_spins / 2));

    score += BONUS_SPIN_SCORE * bonus_spins;

    return score;
}

function calculate_nested_score_per_object(beatmap: BeatmapData): number {
    if (beatmap.hit_objects.length === 0) return 0;

    let big_ticks = 0;
    let small_ticks = 0;

    for (const hit_object of beatmap.hit_objects) {
        if (!hit_object.is_slider) continue;

        const span_count = hit_object.slider_span_count ?? 1;
        const repeat_count = Math.max(0, span_count - 1);
        const nested_count = hit_object.slider_nested_times?.length ?? 2;
        big_ticks += 2 + repeat_count;
        small_ticks += Math.max(0, nested_count - 2 - repeat_count);
    }

    let spinner_score = 0;
    for (const hit_object of beatmap.hit_objects) {
        if (hit_object.is_spinner) {
            spinner_score += calculate_spinner_score(hit_object);
        }
    }

    return (
        (big_ticks * 30 + small_ticks * 10 + spinner_score) /
        beatmap.hit_objects.length
    );
}

function calculate_maximum_legacy_combo_score(
    beatmap: BeatmapData,
    hp: number,
    od: number,
    cs: number,
): number {
    const score_multiplier = calculate_difficulty_peppy_stars(
        beatmap,
        hp,
        od,
        cs,
    );
    let combo = 0;
    let combo_score = 0;

    for (const hit_object of beatmap.hit_objects) {
        if (hit_object.is_slider) {
            combo += hit_object.slider_nested_times?.length ?? 2;
            combo_score += Math.trunc(
                Math.max(0, combo - 1) * 12 * score_multiplier,
            );
        } else {
            combo_score += Math.trunc(
                Math.max(0, combo - 1) * 12 * score_multiplier,
            );
            combo++;
        }
    }

    return combo_score;
}

export function calculate_difficulty(
    beatmap: BeatmapData,
    mods: string[],
    rework: OsuRework = "mar2025",
): DifficultyAttributes {
    const { clock_rate, ar, od, cs, hp } = apply_mods_to_difficulty(
        beatmap,
        mods,
    );
    const hit_objects = prepare_hit_objects_for_difficulty(
        beatmap,
        mods,
        cs,
        ar,
    );
    const { effective_ar, effective_od } = calculate_effective_arod(
        ar,
        od,
        clock_rate,
        rework,
    );

    const all_objects: OsuDifficultyHitObject[] = [];

    for (let i = 1; i < hit_objects.length; i++) {
        const current = hit_objects[i]!;
        const last = hit_objects[i - 1]!;
        const last_last =
            rework === "oct2025"
                ? i > 2
                    ? hit_objects[i - 2]!
                    : null
                : i > 1
                  ? hit_objects[i - 2]!
                  : null;

        all_objects.push(
            new OsuDifficultyHitObject(
                current,
                last,
                last_last,
                clock_rate,
                cs,
                od,
                ar,
                rework,
                all_objects,
                all_objects.length,
            ),
        );
    }

    const aim_result = calculate_aim_skill(all_objects, true, rework);
    const aim_without_sliders_result = calculate_aim_skill(
        all_objects,
        false,
        rework,
    );
    const speed_result = calculate_speed_skill(all_objects, mods, rework);
    const flashlight_result = mods.includes("FL")
        ? calculate_flashlight_skill(all_objects, mods.includes("HD"))
        : null;

    const aim_difficulty_value = aim_result.difficulty_value;
    const aim_difficult_slider_count = aim_result.difficult_slider_count;
    const aim_no_sliders_difficulty_value =
        aim_without_sliders_result.difficulty_value;
    const slider_factor =
        aim_difficulty_value > 0
            ? calculate_difficulty_rating(aim_no_sliders_difficulty_value) /
              calculate_difficulty_rating(aim_difficulty_value)
            : 1;

    const speed_difficulty_value = speed_result.difficulty_value;
    const speed_note_count = speed_result.speed_note_count;

    const aim_difficult_strain_count = aim_result.aim_difficult_strain_count;
    const speed_difficult_strain_count =
        speed_result.speed_difficult_strain_count;

    const aim_no_sliders_top_weighted_slider_count =
        count_aim_top_weighted_sliders(
            aim_without_sliders_result.slider_strains,
            aim_without_sliders_result.difficulty_value,
        );
    const aim_no_sliders_difficult_strain_count =
        aim_without_sliders_result.aim_difficult_strain_count;

    const aim_top_weighted_slider_factor =
        aim_no_sliders_top_weighted_slider_count /
        Math.max(
            1,
            aim_no_sliders_difficult_strain_count -
                aim_no_sliders_top_weighted_slider_count,
        );

    const speed_top_weighted_slider_count = count_speed_top_weighted_sliders(
        speed_result.slider_strains,
        speed_result.difficulty_value,
    );
    const speed_top_weighted_slider_factor =
        speed_top_weighted_slider_count /
        Math.max(
            1,
            speed_difficult_strain_count - speed_top_weighted_slider_count,
        );

    const mechanical_base_performance =
        difficulty_to_performance(
            calculate_difficulty_rating(aim_difficulty_value),
        ) **
            1.1 +
        difficulty_to_performance(
            calculate_difficulty_rating(speed_difficulty_value),
        ) **
            1.1;
    const mechanical_difficulty_rating = calculate_star_rating(
        mechanical_base_performance ** (1 / 1.1),
        rework,
    );

    const aim_rating = compute_aim_rating(
        aim_difficulty_value,
        mods,
        beatmap.hit_objects.length,
        effective_ar,
        effective_od,
        mechanical_difficulty_rating,
        slider_factor,
        rework,
    );
    const speed_rating = compute_speed_rating(
        speed_difficulty_value,
        mods,
        beatmap.hit_objects.length,
        effective_ar,
        effective_od,
        mechanical_difficulty_rating,
        rework,
    );
    const flashlight_rating = compute_flashlight_rating(
        flashlight_result?.difficulty_value ?? 0,
        mods,
        beatmap.hit_objects.length,
        effective_od,
        rework,
    );

    const base_aim_performance = difficulty_to_performance(aim_rating);
    const base_speed_performance = difficulty_to_performance(speed_rating);
    const base_flashlight_performance = mods.includes("FL")
        ? flashlight_difficulty_to_performance(flashlight_rating)
        : 0;

    const base_performance =
        (base_aim_performance ** 1.1 +
            base_speed_performance ** 1.1 +
            base_flashlight_performance ** 1.1) **
        (1 / 1.1);

    const star_rating = calculate_star_rating(base_performance, rework);

    return {
        star_rating: star_rating,
        max_combo: beatmap.max_combo,
        aim_difficulty: aim_rating,
        aim_difficult_slider_count:
            rework === "oct2024" ? 0 : aim_difficult_slider_count,
        speed_difficulty: speed_rating,
        speed_note_count: speed_note_count,
        flashlight_difficulty: flashlight_rating,
        slider_factor: slider_factor,
        aim_difficult_strain_count: aim_difficult_strain_count,
        speed_difficult_strain_count: speed_difficult_strain_count,
        aim_top_weighted_slider_factor: aim_top_weighted_slider_factor,
        speed_top_weighted_slider_factor: speed_top_weighted_slider_factor,
        approach_rate: beatmap.ar,
        overall_difficulty: beatmap.od,
        circle_size: cs,
        hit_circle_count: beatmap.num_hit_circles,
        slider_count: beatmap.num_sliders,
        spinner_count: beatmap.num_spinners,
        total_hits: beatmap.hit_objects.length,
        effective_ar: effective_ar,
        effective_od: effective_od,
        hit_window_great:
            rework === "oct2025"
                ? osu_hit_window(od, 80, 50, 20) / clock_rate
                : (80 - 6 * od) / clock_rate,
        hit_window_ok:
            rework === "oct2025"
                ? osu_hit_window(od, 140, 100, 60) / clock_rate
                : (140 - 8 * od) / clock_rate,
        hit_window_meh:
            rework === "oct2025"
                ? osu_hit_window(od, 200, 150, 100) / clock_rate
                : (200 - 10 * od) / clock_rate,
        drain_rate: hp,
        nested_score_per_object: calculate_nested_score_per_object(beatmap),
        legacy_score_base_multiplier: calculate_difficulty_peppy_stars(
            beatmap,
            hp,
            od,
            cs,
        ),
        maximum_legacy_combo_score: calculate_maximum_legacy_combo_score(
            beatmap,
            beatmap.hp,
            beatmap.od,
            beatmap.cs,
        ),
    };
}

function prepare_hit_objects_for_difficulty(
    beatmap: BeatmapData,
    mods: string[],
    circle_size: number,
    approach_rate: number,
): HitObject[] {
    const hard_rock = mods.includes("HR");
    const obj_scale = Math.fround(
        ((1 - (0.7 * (circle_size - 5)) / 5) / 2) * 1.00041,
    );

    const hit_objects = beatmap.hit_objects.map((hit_object) => {
        const prepared: HitObject = { ...hit_object };
        prepared.stack_height = 0;
        prepared.stacked_x = prepared.x;
        prepared.stacked_y = prepared.y;

        if (hard_rock) {
            prepared.y = reflect_y(prepared.y);
            prepared.end_y =
                prepared.end_y == null ? undefined : reflect_y(prepared.end_y);
            prepared.lazy_end_y =
                prepared.lazy_end_y == null
                    ? undefined
                    : reflect_y(prepared.lazy_end_y);
            prepared.slider_path = prepared.slider_path?.map((point) => ({
                ...point,
                y: -point.y,
            }));
        }

        if (
            prepared.is_slider &&
            prepared.slider_path &&
            prepared.slider_span_count != null &&
            prepared.slider_pixel_length != null &&
            prepared.slider_duration != null &&
            prepared.slider_nested_times
        ) {
            const lazy = compute_lazy_slider_position(
                { x: prepared.x, y: prepared.y },
                prepared.slider_path,
                prepared.slider_span_count,
                prepared.slider_pixel_length,
                hit_object.time,
                prepared.slider_duration,
                prepared.slider_nested_times,
                circle_size,
            );
            prepared.lazy_end_x = lazy.lazy_end_x;
            prepared.lazy_end_y = lazy.lazy_end_y;
            prepared.lazy_travel_distance = lazy.lazy_travel_distance;
            prepared.lazy_travel_time = lazy.lazy_travel_time;
            prepared.tail_x = lazy.tail_x;
            prepared.tail_y = lazy.tail_y;
        }

        return prepared;
    });

    apply_osu_stacking(
        hit_objects,
        approach_rate,
        beatmap.stack_leniency,
        beatmap.format_version,
    );

    for (const hit_object of hit_objects) {
        const offset = Math.fround(hit_object.stack_height * obj_scale * -6.4);
        hit_object.stacked_x = Math.fround(hit_object.x + offset);
        hit_object.stacked_y = Math.fround(hit_object.y + offset);
    }

    return hit_objects;
}

function reflect_y(y: number): number {
    return 384 - y;
}

function compute_lazy_slider_position(
    start: { x: number; y: number },
    path: { x: number; y: number }[],
    span_count: number,
    pixel_length: number,
    start_time: number,
    duration: number,
    nested_times: number[],
    circle_size: number,
) {
    const radius = Math.fround(
        64 * Math.fround(((1 - (0.7 * (circle_size - 5)) / 5) / 2) * 1.00041),
    );
    const scaling_factor = 50 / radius;
    const span_duration = duration / span_count;
    const tail_leniency = -36;

    let tracking_end_time = Math.max(
        start_time + duration + tail_leniency,
        start_time + duration / 2,
    );

    const is_repeat_time = (time: number) => {
        for (let repeat = 1; repeat < span_count; repeat++) {
            if (
                Math.abs(time - (start_time + repeat * span_duration)) < 0.001
            ) {
                return true;
            }
        }
        return false;
    };

    let last_real_tick: number | null = null;
    for (const nested_time of nested_times) {
        if (
            Math.abs(nested_time - start_time) >= 0.001 &&
            Math.abs(nested_time - (start_time + duration)) >= 0.001 &&
            !is_repeat_time(nested_time)
        ) {
            last_real_tick = nested_time;
        }
    }

    let ordered_nested_times = [...nested_times];
    if (last_real_tick != null && last_real_tick > tracking_end_time) {
        tracking_end_time = last_real_tick;
        ordered_nested_times = ordered_nested_times.filter(
            (time) => Math.abs(time - last_real_tick!) >= 0.001,
        );
        ordered_nested_times.push(last_real_tick);
    }

    const lazy_travel_time = tracking_end_time - start_time;

    let end_time_min = lazy_travel_time / span_duration;
    if (end_time_min % 2 >= 1) end_time_min = 1 - (end_time_min % 1);
    else end_time_min %= 1;

    let lazy_end = {
        x: start.x + point_at_slider_path(path, end_time_min * pixel_length).x,
        y: start.y + point_at_slider_path(path, end_time_min * pixel_length).y,
    };
    let cursor_position = { ...start };
    let lazy_travel_distance = 0;

    const position_at_progress = (progress: number) => {
        const span_progress = (progress * span_count) % 1;
        const span = Math.floor(progress * span_count);
        const path_progress =
            span % 2 === 1 ? 1 - span_progress : span_progress;
        const point = point_at_slider_path(path, path_progress * pixel_length);
        return { x: start.x + point.x, y: start.y + point.y };
    };

    for (let i = 1; i < ordered_nested_times.length; i++) {
        const nested_time = ordered_nested_times[i]!;
        const progress = (nested_time - start_time) / duration;
        let movement = {
            x: position_at_progress(progress).x - cursor_position.x,
            y: position_at_progress(progress).y - cursor_position.y,
        };
        let movement_length =
            scaling_factor *
            Math.sqrt(movement.x * movement.x + movement.y * movement.y);
        let required_movement = 50 * 1.8;

        if (i === ordered_nested_times.length - 1) {
            const lazy_movement = {
                x: lazy_end.x - cursor_position.x,
                y: lazy_end.y - cursor_position.y,
            };
            if (
                Math.sqrt(
                    lazy_movement.x * lazy_movement.x +
                        lazy_movement.y * lazy_movement.y,
                ) < Math.sqrt(movement.x * movement.x + movement.y * movement.y)
            ) {
                movement = lazy_movement;
                movement_length =
                    scaling_factor *
                    Math.sqrt(
                        movement.x * movement.x + movement.y * movement.y,
                    );
            }
        } else if (is_repeat_time(nested_time)) {
            required_movement = 50;
        }

        if (movement_length > required_movement) {
            const movement_ratio =
                (movement_length - required_movement) / movement_length;
            cursor_position = {
                x: cursor_position.x + movement.x * movement_ratio,
                y: cursor_position.y + movement.y * movement_ratio,
            };
            lazy_travel_distance += movement_length - required_movement;
        }

        if (i === ordered_nested_times.length - 1) lazy_end = cursor_position;
    }

    lazy_travel_distance *= (1 + (span_count - 1) / 2.5) ** (1 / 2.5);

    const tail = position_at_progress(1);

    return {
        lazy_end_x: lazy_end.x,
        lazy_end_y: lazy_end.y,
        lazy_travel_distance,
        lazy_travel_time,
        tail_x: tail.x,
        tail_y: tail.y,
    };
}
