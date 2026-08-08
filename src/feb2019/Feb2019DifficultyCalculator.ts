import type { BeatmapData } from "../BeatmapData";
import {
    apply_mods_to_difficulty,
    calculate_effective_arod,
    prepare_hit_objects_for_difficulty,
    type DifficultyAttributes,
} from "../mar2025/DifficultyCalculator";
import { OsuDifficultyHitObject } from "../mar2025/OsuDifficultyHitObject";

const SECTION_LENGTH = 400;
const DIFFICULTY_MULTIPLIER = 0.0675;

function strain_decay(base: number, milliseconds: number): number {
    return base ** (milliseconds / 1000);
}

function calculate_aim_strain(current: OsuDifficultyHitObject): number {
    const previous = current.previous(0);
    let angle_bonus = 0;

    if (previous && current.angle != null && current.angle > Math.PI / 3) {
        const angle_distance = Math.sin(current.angle - Math.PI / 3) ** 2;
        const jump_distance = Math.max(previous.jump_distance - 90, 0);
        const current_jump_distance = Math.max(current.jump_distance - 90, 0);
        angle_bonus =
            1.5 *
            Math.max(
                0,
                Math.sqrt(
                    jump_distance * angle_distance * current_jump_distance,
                ),
            ) **
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
    first_object_time: number,
): { difficulty_value: number; object_strains: number[] } {
    if (objects.length === 0)
        return { difficulty_value: 0, object_strains: [] };

    const strain_decay_base = speed ? 0.3 : 0.15;
    const skill_multiplier = speed ? 1400 : 26.25;
    const strain_peaks: number[] = [];
    const object_strains: number[] = [];
    let current_strain = 1;
    let current_section_peak = 1;
    let current_section_end =
        Math.ceil(first_object_time / (SECTION_LENGTH * clock_rate)) *
        SECTION_LENGTH *
        clock_rate;

    for (const current of objects) {
        while (current.base_object.time > current_section_end) {
            if (object_strains.length > 0)
                strain_peaks.push(current_section_peak);
            const previous = current.previous(0);
            current_section_peak = previous
                ? current_strain *
                  strain_decay(
                      strain_decay_base,
                      current_section_end - previous.base_object.time,
                  )
                : current_strain;
            current_section_end += SECTION_LENGTH * clock_rate;
        }

        current_strain *= strain_decay(strain_decay_base, current.delta_time);

        if (!current.base_object.is_spinner) {
            current_strain +=
                (speed
                    ? calculate_speed_strain(current)
                    : calculate_aim_strain(current)) * skill_multiplier;
        }

        current_section_peak = Math.max(current_section_peak, current_strain);
        object_strains.push(current_strain);
    }

    strain_peaks.push(current_section_peak);
    strain_peaks.sort((a, b) => b - a);

    let difficulty_value = 0;
    let weight = 1;
    for (const strain of strain_peaks) {
        difficulty_value += strain * weight;
        weight *= 0.9;
    }

    return { difficulty_value, object_strains };
}

function calculate_difficulty_rating(difficulty_value: number): number {
    return Math.sqrt(difficulty_value) * DIFFICULTY_MULTIPLIER;
}

export function calculate_feb2019_difficulty(
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

    const first_object_time = beatmap.hit_objects[0]?.time ?? 0;
    const aim_result = calculate_strain(
        difficulty_objects,
        clock_rate,
        false,
        first_object_time,
    );
    const speed_result = calculate_strain(
        difficulty_objects,
        clock_rate,
        true,
        first_object_time,
    );
    const aim_difficulty = calculate_difficulty_rating(
        aim_result.difficulty_value,
    );
    const speed_difficulty = calculate_difficulty_rating(
        speed_result.difficulty_value,
    );
    const { effective_ar, effective_od } = calculate_effective_arod(
        ar,
        od,
        clock_rate,
        "feb2019",
    );

    return {
        star_rating:
            aim_difficulty +
            speed_difficulty +
            Math.abs(aim_difficulty - speed_difficulty) / 2,
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
