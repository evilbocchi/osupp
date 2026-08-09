import type { BeatmapData } from "../BeatmapData";
import {
    apply_mods_to_difficulty,
    calculate_effective_arod,
    prepare_hit_objects_for_difficulty,
    type DifficultyAttributes,
} from "../mar2025/DifficultyCalculator";
import { OsuDifficultyHitObject } from "../mar2025/OsuDifficultyHitObject";
import { clamp } from "../utils";

const SECTION_LENGTH = 400;
const DIFFICULTY_MULTIPLIER = 0.0675;

function strain_decay(base: number, milliseconds: number): number {
    return base ** (milliseconds / 1000);
}

function reduce_strain_peaks(
    peaks: number[],
    reduced_section_count: number,
    reduced_strain_baseline: number,
    difficulty_multiplier: number,
): number {
    peaks.sort((a, b) => b - a);

    for (let i = 0; i < Math.min(peaks.length, reduced_section_count); i++) {
        const scale = Math.log10(
            1 + 9 * clamp(i / reduced_section_count, 0, 1),
        );
        peaks[i] =
            peaks[i]! *
            (reduced_strain_baseline + (1 - reduced_strain_baseline) * scale);
    }

    let difficulty = 0;
    let weight = 1;
    for (const strain of peaks.sort((a, b) => b - a)) {
        difficulty += strain * weight;
        weight *= 0.9;
    }

    return difficulty * difficulty_multiplier;
}

function calculate_aim_strain(current: OsuDifficultyHitObject): number {
    const previous = current.previous(0);
    let angle_bonus = 0;

    if (previous && current.angle != null && current.angle > Math.PI / 3) {
        const angle_distance = Math.sin(current.angle - Math.PI / 3) ** 2;
        const jump_distance = Math.max(previous.jump_distance - 90, 0);
        const current_jump_distance = Math.max(current.jump_distance - 90, 0);
        angle_bonus =
            1.4 *
            Math.sqrt(jump_distance * angle_distance * current_jump_distance) **
                0.99;
        angle_bonus /= Math.max(107, previous.strain_time);
    }

    const jump_distance = current.jump_distance ** 0.99;
    const travel_distance = current.travel_distance ** 0.99;
    const base_strain =
        jump_distance +
        travel_distance +
        Math.sqrt(jump_distance * travel_distance);

    return Math.max(
        angle_bonus + base_strain / Math.max(current.strain_time, 107),
        base_strain / current.strain_time,
    );
}

function calculate_speed_strain(current: OsuDifficultyHitObject): number {
    const distance = Math.min(
        125,
        current.travel_distance + current.jump_distance,
    );
    const delta_time = Math.max(45, current.delta_time);

    let speed_bonus = 1;
    if (delta_time < 75) speed_bonus = 1 + ((75 - delta_time) / 40) ** 2;

    let angle_bonus = 1;
    if (current.angle != null && current.angle < (5 * Math.PI) / 6) {
        angle_bonus =
            1 + Math.sin(1.5 * ((5 * Math.PI) / 6 - current.angle)) ** 2 / 3.57;

        if (current.angle < Math.PI / 2) {
            angle_bonus = 1.28;
            if (distance < 90 && current.angle < Math.PI / 4) {
                angle_bonus +=
                    (1 - angle_bonus) * Math.min((90 - distance) / 10, 1);
            } else if (distance < 90) {
                angle_bonus +=
                    (1 - angle_bonus) *
                    Math.min((90 - distance) / 10, 1) *
                    Math.sin((Math.PI / 2 - current.angle) / (Math.PI / 4));
            }
        }
    }

    return (
        ((1 + (speed_bonus - 1) * 0.75) *
            angle_bonus *
            (0.95 + speed_bonus * (distance / 125) ** 3.5)) /
        current.strain_time
    );
}

function calculate_strain(
    objects: OsuDifficultyHitObject[],
    clock_rate: number,
    speed: boolean,
): number {
    if (objects.length === 0) return 0;

    const strain_decay_base = speed ? 0.3 : 0.15;
    const skill_multiplier = speed ? 1400 : 26.25;
    const reduced_section_count = speed ? 5 : 10;
    const difficulty_multiplier = speed ? 1.04 : 1.06;
    const strain_peaks: number[] = [];
    let current_strain = 1;
    let current_section_peak = 1;
    let current_section_end =
        Math.ceil(objects[0]!.start_time / SECTION_LENGTH) * SECTION_LENGTH;

    for (const current of objects) {
        while (current.start_time > current_section_end) {
            strain_peaks.push(current_section_peak);
            const previous = current.previous(0);
            current_section_peak = previous
                ? current_strain *
                  strain_decay(
                      strain_decay_base,
                      current_section_end - previous.start_time,
                  )
                : current_strain;
            current_section_end += SECTION_LENGTH;
        }

        current_strain *= strain_decay(strain_decay_base, current.delta_time);

        if (!current.base_object.is_spinner) {
            current_strain +=
                (speed
                    ? calculate_speed_strain(current)
                    : calculate_aim_strain(current)) * skill_multiplier;
        }

        current_section_peak = Math.max(current_section_peak, current_strain);
    }

    strain_peaks.push(current_section_peak);
    return reduce_strain_peaks(
        strain_peaks,
        reduced_section_count,
        0.75,
        difficulty_multiplier,
    );
}

function difficulty_rating(difficulty_value: number): number {
    return Math.sqrt(difficulty_value) * DIFFICULTY_MULTIPLIER;
}

function performance_from_rating(rating: number): number {
    return (5 * Math.max(1, rating) - 4) ** 3 / 100000;
}

export function calculate_jul2021_difficulty(
    beatmap: BeatmapData,
    mods: string[],
): DifficultyAttributes {
    const { clock_rate, ar, od, cs, hp } = apply_mods_to_difficulty(
        beatmap,
        mods,
        "feb2019",
    );
    const hit_objects = prepare_hit_objects_for_difficulty(
        beatmap,
        mods,
        cs,
        ar,
        "feb2019",
    );
    const difficulty_objects: OsuDifficultyHitObject[] = [];

    for (let index = 1; index < hit_objects.length; index++) {
        difficulty_objects.push(
            new OsuDifficultyHitObject(
                hit_objects[index]!,
                hit_objects[index - 1]!,
                index > 1 ? hit_objects[index - 2]! : null,
                clock_rate,
                cs,
                od,
                ar,
                "feb2019",
                mods.includes("HD"),
                difficulty_objects,
                difficulty_objects.length,
            ),
        );
    }

    const aim_difficulty = difficulty_rating(
        calculate_strain(difficulty_objects, clock_rate, false),
    );
    const speed_difficulty = difficulty_rating(
        calculate_strain(difficulty_objects, clock_rate, true),
    );
    const base_performance =
        (performance_from_rating(aim_difficulty) ** 1.1 +
            performance_from_rating(speed_difficulty) ** 1.1) **
        (1 / 1.1);
    const star_rating =
        base_performance > 0.00001
            ? 0.027 *
              (Math.cbrt((100000 / 2 ** (1 / 1.1)) * base_performance) + 4)
            : 0;
    const { effective_ar, effective_od } = calculate_effective_arod(
        ar,
        od,
        clock_rate,
        "feb2019",
    );

    return {
        star_rating,
        max_combo: beatmap.max_combo,
        aim_difficulty,
        aim_difficult_slider_count: 0,
        speed_difficulty,
        speed_note_count: 0,
        flashlight_difficulty: 0,
        reading_difficulty: 0,
        slider_factor: 1,
        aim_difficult_strain_count: 0,
        speed_difficult_strain_count: 0,
        reading_difficult_note_count: 0,
        aim_top_weighted_slider_factor: 0,
        speed_top_weighted_slider_factor: 0,
        approach_rate: effective_ar,
        overall_difficulty: effective_od,
        circle_size: cs,
        hit_circle_count: beatmap.num_hit_circles,
        slider_count: beatmap.num_sliders,
        spinner_count: beatmap.num_spinners,
        total_hits: beatmap.hit_objects.length,
        effective_ar,
        effective_od,
        hit_window_great: Math.trunc(80 - 6 * od) / clock_rate,
        hit_window_ok: (140 - 8 * od) / clock_rate,
        hit_window_meh: (200 - 10 * od) / clock_rate,
        drain_rate: hp,
        nested_score_per_object: 0,
        legacy_score_base_multiplier: 0,
        maximum_legacy_combo_score: 0,
    };
}
