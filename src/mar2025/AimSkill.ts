import {
    clamp,
    lerp,
    logistic,
    milliseconds_to_bpm,
    reverse_lerp,
    smootherstep,
    smoothstep,
} from "../utils";
import type { OsuDifficultyHitObject } from "./OsuDifficultyHitObject";

const NORMALIZED_RADIUS = 50;
const NORMALIZED_DIAMETER = NORMALIZED_RADIUS * 2;
const WIDE_ANGLE_MULTIPLIER = 1.5;
const SLIDER_MULTIPLIER = 1.35;
const VELOCITY_CHANGE_MULTIPLIER = 0.75;
const WIGGLE_MULTIPLIER = 1.02;
const STRAIN_DECAY_BASE = 0.15;

export type OsuRework =
    "feb2019" | "mar2025" | "oct2024" | "oct2025" | "jul2026" | "sep2022";

function strain_decay(ms: number): number {
    return STRAIN_DECAY_BASE ** (ms / 1000);
}

function calc_wide_angle_bonus(angle: number): number {
    return smoothstep(angle, (40 * Math.PI) / 180, (140 * Math.PI) / 180);
}

function calc_acute_angle_bonus(angle: number): number {
    return smoothstep(angle, (140 * Math.PI) / 180, (40 * Math.PI) / 180);
}

function calc_oct2024_wide_angle_bonus(angle: number): number {
    return (
        Math.sin(
            (3 / 4) *
                (clamp(angle, Math.PI / 6, (5 * Math.PI) / 6) - Math.PI / 6),
        ) ** 2
    );
}

function calc_oct2024_acute_angle_bonus(angle: number): number {
    return 1 - calc_oct2024_wide_angle_bonus(angle);
}

function evaluate_aim_difficulty(
    current: OsuDifficultyHitObject,
    with_slider_travel_distance: boolean,
    rework: OsuRework,
): number {
    if (
        current.base_object.is_spinner ||
        current.index <= 1 ||
        current.previous(0)?.base_object.is_spinner
    ) {
        return 0;
    }

    const osu_last_obj = current.previous(0)!;
    const osu_last_last_obj = current.previous(1)!;

    let curr_velocity = current.lazy_jump_distance / current.strain_time;

    if (osu_last_obj.base_object.is_slider && with_slider_travel_distance) {
        const travel_velocity =
            osu_last_obj.travel_distance / osu_last_obj.travel_time;
        const movement_velocity =
            current.minimum_jump_distance / current.minimum_jump_time;
        curr_velocity = Math.max(
            curr_velocity,
            movement_velocity + travel_velocity,
        );
    }

    let prev_velocity =
        osu_last_obj.lazy_jump_distance / osu_last_obj.strain_time;

    if (
        osu_last_last_obj.base_object.is_slider &&
        with_slider_travel_distance
    ) {
        const travel_velocity =
            osu_last_last_obj.travel_distance / osu_last_last_obj.travel_time;
        const movement_velocity =
            osu_last_obj.minimum_jump_distance / osu_last_obj.minimum_jump_time;
        prev_velocity = Math.max(
            prev_velocity,
            movement_velocity + travel_velocity,
        );
    }

    let wide_angle_bonus = 0;
    let acute_angle_bonus = 0;
    let slider_bonus = 0;
    let velocity_change_bonus = 0;
    let wiggle_bonus = 0;

    let aim_strain = curr_velocity;

    if (rework === "sep2022") {
        if (
            Math.max(current.strain_time, osu_last_obj.strain_time) <
                1.25 *
                    Math.min(current.strain_time, osu_last_obj.strain_time) &&
            current.angle != null &&
            osu_last_obj.angle != null &&
            osu_last_last_obj.angle != null
        ) {
            const curr_angle = current.angle;
            const last_angle = osu_last_obj.angle;
            const last_last_angle = osu_last_last_obj.angle;
            const angle_bonus = Math.min(curr_velocity, prev_velocity);

            wide_angle_bonus = calc_oct2024_wide_angle_bonus(curr_angle);
            acute_angle_bonus = calc_oct2024_acute_angle_bonus(curr_angle);

            if (current.strain_time > 100) {
                acute_angle_bonus = 0;
            } else {
                acute_angle_bonus *=
                    calc_oct2024_acute_angle_bonus(last_angle) *
                    Math.min(angle_bonus, 125 / current.strain_time) *
                    Math.sin(
                        (Math.PI / 2) *
                            Math.min(1, (100 - current.strain_time) / 25),
                    ) **
                        2 *
                    Math.sin(
                        (Math.PI / 2) *
                            ((clamp(
                                current.lazy_jump_distance,
                                NORMALIZED_RADIUS,
                                NORMALIZED_DIAMETER,
                            ) -
                                NORMALIZED_RADIUS) /
                                NORMALIZED_RADIUS),
                    ) **
                        2;
            }

            wide_angle_bonus *=
                angle_bonus *
                (1 -
                    Math.min(
                        wide_angle_bonus,
                        calc_oct2024_wide_angle_bonus(last_angle) ** 3,
                    ));
            acute_angle_bonus *=
                0.5 +
                0.5 *
                    (1 -
                        Math.min(
                            acute_angle_bonus,
                            calc_oct2024_acute_angle_bonus(last_last_angle) **
                                3,
                        ));
        }
    }

    if (
        rework !== "sep2022" &&
        rework === "oct2025" &&
        current.angle != null &&
        osu_last_obj.angle != null
    ) {
        const curr_angle = current.angle;
        const last_angle = osu_last_obj.angle;
        const angle_bonus = Math.min(curr_velocity, prev_velocity);

        if (
            Math.max(current.strain_time, osu_last_obj.strain_time) <
            1.25 * Math.min(current.strain_time, osu_last_obj.strain_time)
        ) {
            acute_angle_bonus = calc_acute_angle_bonus(curr_angle);
            acute_angle_bonus *=
                0.08 +
                0.92 *
                    (1 -
                        Math.min(
                            acute_angle_bonus,
                            calc_acute_angle_bonus(last_angle) ** 3,
                        ));
            acute_angle_bonus *=
                angle_bonus *
                smootherstep(
                    milliseconds_to_bpm(current.strain_time, 2),
                    300,
                    400,
                ) *
                smootherstep(
                    current.lazy_jump_distance,
                    NORMALIZED_DIAMETER,
                    NORMALIZED_DIAMETER * 2,
                );
        }

        wide_angle_bonus = calc_wide_angle_bonus(curr_angle);
        wide_angle_bonus *=
            1 -
            Math.min(wide_angle_bonus, calc_wide_angle_bonus(last_angle) ** 3);
        wide_angle_bonus *=
            angle_bonus *
            smootherstep(current.lazy_jump_distance, 0, NORMALIZED_DIAMETER);

        wiggle_bonus =
            angle_bonus *
            smootherstep(
                current.lazy_jump_distance,
                NORMALIZED_RADIUS,
                NORMALIZED_DIAMETER,
            ) *
            reverse_lerp(
                current.lazy_jump_distance,
                NORMALIZED_DIAMETER * 3,
                NORMALIZED_DIAMETER,
            ) **
                1.8 *
            smootherstep(
                curr_angle,
                (110 * Math.PI) / 180,
                (60 * Math.PI) / 180,
            ) *
            smootherstep(
                osu_last_obj.lazy_jump_distance,
                NORMALIZED_RADIUS,
                NORMALIZED_DIAMETER,
            ) *
            reverse_lerp(
                osu_last_obj.lazy_jump_distance,
                NORMALIZED_DIAMETER * 3,
                NORMALIZED_DIAMETER,
            ) **
                1.8 *
            smootherstep(
                last_angle,
                (110 * Math.PI) / 180,
                (60 * Math.PI) / 180,
            );

        const osu_last2_obj = current.previous(2);
        if (osu_last2_obj) {
            const dx =
                osu_last2_obj.base_object.stacked_x -
                osu_last_obj.base_object.stacked_x;
            const dy =
                osu_last2_obj.base_object.stacked_y -
                osu_last_obj.base_object.stacked_y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 1) {
                wide_angle_bonus *= 1 - 0.35 * (1 - distance);
            }
        }
    }

    const use_legacy_angle_gate = rework !== "oct2025" && rework !== "sep2022";

    if (
        use_legacy_angle_gate &&
        Math.max(current.strain_time, osu_last_obj.strain_time) <
            1.25 * Math.min(current.strain_time, osu_last_obj.strain_time)
    ) {
        if (current.angle != null && osu_last_obj.angle != null) {
            const curr_angle = current.angle;
            const last_angle = osu_last_obj.angle;
            const angle_bonus = Math.min(curr_velocity, prev_velocity);

            if (rework === "oct2024") {
                const last_last_angle = osu_last_last_obj.angle;
                if (last_last_angle != null) {
                    wide_angle_bonus =
                        calc_oct2024_wide_angle_bonus(curr_angle);
                    acute_angle_bonus =
                        calc_oct2024_acute_angle_bonus(curr_angle);

                    if (milliseconds_to_bpm(current.strain_time, 2) < 300) {
                        acute_angle_bonus = 0;
                    } else {
                        acute_angle_bonus *=
                            calc_oct2024_acute_angle_bonus(last_angle) *
                            Math.min(
                                angle_bonus,
                                (NORMALIZED_DIAMETER * 1.25) /
                                    current.strain_time,
                            ) *
                            Math.sin(
                                (Math.PI / 2) *
                                    Math.min(
                                        1,
                                        (100 - current.strain_time) / 25,
                                    ),
                            ) **
                                2 *
                            Math.sin(
                                ((Math.PI / 2) *
                                    (clamp(
                                        current.lazy_jump_distance,
                                        NORMALIZED_RADIUS,
                                        NORMALIZED_DIAMETER,
                                    ) -
                                        NORMALIZED_RADIUS)) /
                                    NORMALIZED_RADIUS,
                            ) **
                                2;
                    }

                    wide_angle_bonus *=
                        angle_bonus *
                        (1 -
                            Math.min(
                                wide_angle_bonus,
                                calc_oct2024_wide_angle_bonus(last_angle) ** 3,
                            ));
                    acute_angle_bonus *=
                        0.5 +
                        0.5 *
                            (1 -
                                Math.min(
                                    acute_angle_bonus,
                                    calc_oct2024_acute_angle_bonus(
                                        last_last_angle,
                                    ) ** 3,
                                ));
                }
            } else {
                wide_angle_bonus = calc_wide_angle_bonus(curr_angle);
                acute_angle_bonus = calc_acute_angle_bonus(curr_angle);

                wide_angle_bonus *=
                    1 -
                    Math.min(
                        wide_angle_bonus,
                        calc_wide_angle_bonus(last_angle) ** 3,
                    );
                acute_angle_bonus *=
                    0.08 +
                    0.92 *
                        (1 -
                            Math.min(
                                acute_angle_bonus,
                                calc_acute_angle_bonus(last_angle) ** 3,
                            ));

                wide_angle_bonus *=
                    angle_bonus *
                    smootherstep(
                        current.lazy_jump_distance,
                        0,
                        NORMALIZED_DIAMETER,
                    );

                acute_angle_bonus *=
                    angle_bonus *
                    smootherstep(
                        milliseconds_to_bpm(current.strain_time, 2),
                        300,
                        400,
                    ) *
                    smootherstep(
                        current.lazy_jump_distance,
                        NORMALIZED_DIAMETER,
                        NORMALIZED_DIAMETER * 2,
                    );

                wiggle_bonus =
                    angle_bonus *
                    smootherstep(
                        current.lazy_jump_distance,
                        NORMALIZED_RADIUS,
                        NORMALIZED_DIAMETER,
                    ) *
                    reverse_lerp(
                        current.lazy_jump_distance,
                        NORMALIZED_DIAMETER * 3,
                        NORMALIZED_DIAMETER,
                    ) **
                        1.8 *
                    smootherstep(
                        curr_angle,
                        (110 * Math.PI) / 180,
                        (60 * Math.PI) / 180,
                    ) *
                    smootherstep(
                        osu_last_obj.lazy_jump_distance,
                        NORMALIZED_RADIUS,
                        NORMALIZED_DIAMETER,
                    ) *
                    reverse_lerp(
                        osu_last_obj.lazy_jump_distance,
                        NORMALIZED_DIAMETER * 3,
                        NORMALIZED_DIAMETER,
                    ) **
                        1.8 *
                    smootherstep(
                        last_angle,
                        (110 * Math.PI) / 180,
                        (60 * Math.PI) / 180,
                    );
            }
        }
    }

    if (Math.max(prev_velocity, curr_velocity) !== 0) {
        prev_velocity =
            (osu_last_obj.lazy_jump_distance +
                osu_last_last_obj.travel_distance) /
            osu_last_obj.strain_time;
        curr_velocity =
            (current.lazy_jump_distance + osu_last_obj.travel_distance) /
            current.strain_time;

        const velocity_ratio =
            Math.abs(prev_velocity - curr_velocity) /
            Math.max(prev_velocity, curr_velocity);
        const dist_ratio =
            rework === "oct2025"
                ? smoothstep(velocity_ratio, 0, 1)
                : Math.sin((Math.PI / 2) * velocity_ratio) ** 2;
        const overlap_velocity_buff = Math.min(
            (NORMALIZED_DIAMETER * 1.25) /
                Math.min(current.strain_time, osu_last_obj.strain_time),
            Math.abs(prev_velocity - curr_velocity),
        );

        velocity_change_bonus = overlap_velocity_buff * dist_ratio;
        velocity_change_bonus *=
            (Math.min(current.strain_time, osu_last_obj.strain_time) /
                Math.max(current.strain_time, osu_last_obj.strain_time)) **
            2;
    }

    if (osu_last_obj.base_object.is_slider) {
        slider_bonus = osu_last_obj.travel_distance / osu_last_obj.travel_time;
    }

    if (rework === "oct2025") {
        aim_strain += wiggle_bonus * WIGGLE_MULTIPLIER;
        aim_strain += velocity_change_bonus * VELOCITY_CHANGE_MULTIPLIER;
        aim_strain += Math.max(
            acute_angle_bonus * 2.55,
            wide_angle_bonus * WIDE_ANGLE_MULTIPLIER,
        );
        aim_strain *= current.small_circle_bonus;
    } else {
        if (rework === "mar2025")
            aim_strain += wiggle_bonus * WIGGLE_MULTIPLIER;
        aim_strain += Math.max(
            acute_angle_bonus *
                (rework === "oct2024" || rework === "sep2022" ? 1.95 : 2.6),
            wide_angle_bonus * WIDE_ANGLE_MULTIPLIER +
                velocity_change_bonus * VELOCITY_CHANGE_MULTIPLIER,
        );
    }
    if (with_slider_travel_distance) {
        aim_strain += slider_bonus * SLIDER_MULTIPLIER;
    }

    return aim_strain;
}

export function count_top_weighted_sliders(
    slider_strains: number[],
    difficulty_value: number,
): number {
    if (slider_strains.length === 0) return 0;

    const consistent_top_strain = difficulty_value / 10;
    if (consistent_top_strain === 0) return 0;

    return slider_strains.reduce((sum, strain) => {
        return sum + logistic(strain / consistent_top_strain, 0.88, 10, 1.1);
    }, 0);
}

export function calculate_aim_skill(
    objects: OsuDifficultyHitObject[],
    with_sliders: boolean,
    rework: OsuRework = "mar2025",
): {
    difficulty_value: number;
    aim_difficult_strain_count: number;
    difficult_slider_count: number;
    slider_strains: number[];
} {
    const SECTION_LENGTH = 400;
    const DECAY_WEIGHT = 0.9;
    const REDUCED_SECTION_COUNT = 10;
    const REDUCED_STRAIN_BASELINE = 0.75;

    const strain_peaks: number[] = [];
    const object_strains: number[] = [];
    const slider_strains: number[] = [];

    let current_strain = 0;
    let current_section_peak = 0;
    let current_section_end = 0;

    for (let i = 0; i < objects.length; i++) {
        const current = objects[i]!;

        if (i === 0) {
            current_section_end =
                Math.ceil(current.start_time / SECTION_LENGTH) * SECTION_LENGTH;
        }

        while (current.start_time > current_section_end) {
            strain_peaks.push(current_section_peak);
            const previous = current.previous(0);
            current_section_peak = previous
                ? current_strain *
                  strain_decay(current_section_end - previous.start_time)
                : current_strain;
            current_section_end += SECTION_LENGTH;
        }

        current_strain *= strain_decay(current.delta_time);
        current_strain +=
            evaluate_aim_difficulty(current, with_sliders, rework) *
            (rework === "sep2022"
                ? 23.55
                : rework === "oct2024"
                  ? 25.18
                  : rework === "oct2025"
                    ? 26
                    : 25.6);

        if (current.base_object.is_slider) slider_strains.push(current_strain);

        current_section_peak = Math.max(current_strain, current_section_peak);
        object_strains.push(current_strain);
    }

    const peaks = [...strain_peaks, current_section_peak]
        .filter((peak) => peak > 0)
        .sort((a, b) => b - a);

    for (let i = 0; i < Math.min(peaks.length, REDUCED_SECTION_COUNT); i++) {
        const scale = Math.log10(
            lerp(1, 10, clamp(i / REDUCED_SECTION_COUNT, 0, 1)),
        );
        peaks[i] = peaks[i]! * lerp(REDUCED_STRAIN_BASELINE, 1, scale);
    }

    let difficulty_value = 0;
    let weight = 1;
    for (const strain of peaks.sort((a, b) => b - a)) {
        difficulty_value += strain * weight;
        weight *= DECAY_WEIGHT;
    }

    const consistent_top_strain = difficulty_value / 10;
    const aim_difficult_strain_count =
        consistent_top_strain > 0
            ? object_strains.reduce(
                  (sum, strain) =>
                      sum +
                      1.1 /
                          (1 +
                              Math.exp(
                                  -10 * (strain / consistent_top_strain - 0.88),
                              )),
                  0,
              )
            : object_strains.length;

    const max_slider_strain = slider_strains.length
        ? Math.max(...slider_strains)
        : 0;
    const difficult_slider_count =
        max_slider_strain > 0
            ? slider_strains.reduce(
                  (sum, strain) =>
                      sum +
                      1 /
                          (1 +
                              Math.exp(
                                  -((strain / max_slider_strain) * 12 - 6),
                              )),
                  0,
              )
            : 0;

    return {
        difficulty_value: difficulty_value * (rework === "sep2022" ? 1.06 : 1),
        aim_difficult_strain_count,
        difficult_slider_count,
        slider_strains,
    };
}
