import type { OsuDifficultyHitObject } from "../mar2025/OsuDifficultyHitObject";
import {
    clamp,
    lerp,
    logistic,
    reverse_lerp,
    smootherstep,
    smoothstep,
    smoothstep_bell_curve,
} from "../utils";

interface HarmonicResult {
    difficulty_value: number;
    object_weight_sum: number;
    object_difficulties: number[];
}

interface StrainPeak {
    value: number;
    section_length: number;
}

function round_to_even(value: number): number {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction < 0.5) return lower;
    if (fraction > 0.5) return lower + 1;
    return lower % 2 === 0 ? lower : lower + 1;
}

const NORMALISED_RADIUS = 50;
const NORMALISED_DIAMETER = NORMALISED_RADIUS * 2;

function distance(
    first: { x: number; y: number },
    second: { x: number; y: number },
): number {
    const delta_x = Math.fround(first.x - second.x);
    const delta_y = Math.fround(first.y - second.y);
    return Math.fround(
        Math.sqrt(
            Math.fround(
                Math.fround(delta_x * delta_x) + Math.fround(delta_y * delta_y),
            ),
        ),
    );
}

function norm(exponent: number, ...values: number[]): number {
    return (
        values.reduce((sum, value) => sum + value ** exponent, 0) **
        (1 / exponent)
    );
}

function high_bpm_bonus(ms: number, base: number, exponent = 1): number {
    return 1 / (1 - base ** ((ms / 1000) ** exponent));
}

function calculate_harmonic_difficulty(
    object_difficulties: number[],
    harmonic_scale = 1,
    decay_exponent = 0.9,
    transform: (difficulties: number[]) => number[] = (difficulties) =>
        difficulties,
): HarmonicResult {
    const difficulties = transform([...object_difficulties]);
    let difficulty_value = 0;
    let object_weight_sum = 0;
    let index = 0;

    for (const object_difficulty of difficulties
        .filter((value) => value > 0)
        .sort((first, second) => second - first)) {
        const harmonic_factor = harmonic_scale / (1 + index);
        const weight =
            (1 + harmonic_factor) /
            (index ** decay_exponent + 1 + harmonic_factor);
        object_weight_sum += weight;
        difficulty_value += object_difficulty * weight;
        index++;
    }

    return { difficulty_value, object_weight_sum, object_difficulties };
}

export function harmonic_difficulty_to_performance(difficulty: number): number {
    return 4 * difficulty ** 3;
}

export function count_jul2026_top_weighted_sliders(
    slider_strains: number[],
    difficulty_value: number,
    object_weight_sum = 10,
): number {
    if (slider_strains.length === 0) return 0;

    const consistent_top_strain = difficulty_value / object_weight_sum;
    if (consistent_top_strain === 0) return 0;

    return slider_strains.reduce(
        (sum, strain) =>
            sum + logistic(strain / consistent_top_strain, 0.88, 10, 1.1),
        0,
    );
}

function count_top_weighted_object_difficulties(
    object_difficulties: number[],
    difficulty_value: number,
    object_weight_sum: number,
    midpoint_offset = 0.88,
    multiplier = 10,
): number {
    if (object_difficulties.length === 0 || object_weight_sum === 0) return 0;

    const consistent_top_object = difficulty_value / object_weight_sum;
    if (consistent_top_object === 0) return 0;

    return object_difficulties.reduce(
        (sum, object_difficulty) =>
            sum +
            logistic(
                object_difficulty / consistent_top_object,
                midpoint_offset,
                multiplier,
                1.1,
            ),
        0,
    );
}

function count_top_weighted_strains(
    object_difficulties: number[],
    difficulty_value: number,
    decay_weight: number,
): number {
    if (object_difficulties.length === 0) return 0;

    const consistent_top_strain = difficulty_value * (1 - decay_weight);
    if (consistent_top_strain === 0) return object_difficulties.length;

    return object_difficulties.reduce(
        (sum, strain) =>
            sum +
            1.1 / (1 + Math.exp(-10 * (strain / consistent_top_strain - 0.88))),
        0,
    );
}

function calculate_strain_peaks(
    objects: OsuDifficultyHitObject[],
    evaluate_strain: (
        current: OsuDifficultyHitObject,
        current_strain: number,
    ) => number,
    strain_decay: (ms: number) => number,
): { peaks: StrainPeak[]; object_difficulties: number[] } {
    const max_section_length = 400;
    const decay_weight = 0.9;
    const max_stored_length = 11 / (1 - decay_weight);
    const peaks: StrainPeak[] = [];
    const object_difficulties: number[] = [];
    const queued_strains: { strain_value: number; start_time: number }[] = [];

    let total_length = 0;
    let current_strain = 0;
    let current_section_peak = 0;
    let current_section_begin = 0;
    let current_section_end = 0;
    let peaks_finalised = false;

    const save_current_peak = (section_length: number) => {
        const rounded_section_length = round_to_even(section_length);
        peaks.push({
            value: current_section_peak,
            section_length: rounded_section_length,
        });
        peaks.sort((first, second) => second.value - first.value);
        total_length += rounded_section_length;

        while (
            total_length > max_stored_length * max_section_length &&
            peaks.length > 0
        ) {
            const removed = peaks.pop()!;
            total_length -= removed.section_length;
        }
    };

    const calculate_initial_strain = (
        time: number,
        current: OsuDifficultyHitObject,
    ) => {
        const previous = current.previous(0);
        return previous
            ? current_strain * strain_decay(time - previous.start_time)
            : current_strain;
    };

    for (const current of objects) {
        if (current.index === 0) {
            current_section_begin = current.start_time;
            current_section_end = current_section_begin + max_section_length;
            current_strain = evaluate_strain(current, current_strain);
            current_section_peak = current_strain;
            object_difficulties.push(current_strain);
            continue;
        }

        while (current.start_time > current_section_end) {
            save_current_peak(current_section_end - current_section_begin);
            current_section_begin = current_section_end;

            if (queued_strains.length > 0) {
                const queued = queued_strains.shift()!;
                current_section_end = queued.start_time + max_section_length;
                current_section_peak = Math.max(
                    calculate_initial_strain(current_section_begin, current),
                    queued.strain_value,
                );
            } else {
                current_section_end =
                    current_section_begin + max_section_length;
                current_section_peak = calculate_initial_strain(
                    current_section_begin,
                    current,
                );
            }
        }

        current_strain = evaluate_strain(current, current_strain);

        if (current_strain > current_section_peak) {
            queued_strains.length = 0;
            save_current_peak(current.start_time - current_section_begin);
            current_section_begin = current.start_time;
            current_section_end = current_section_begin + max_section_length;
            current_section_peak = current_strain;
        } else {
            while (
                queued_strains.length > 0 &&
                queued_strains[queued_strains.length - 1]!.strain_value <
                    current_strain
            ) {
                queued_strains.pop();
            }
            queued_strains.push({
                strain_value: current_strain,
                start_time: current.start_time,
            });
        }

        object_difficulties.push(current_strain);
    }

    if (!peaks_finalised && objects.length > 0) {
        save_current_peak(current_section_end - current_section_begin);
        peaks_finalised = true;
    }

    return { peaks, object_difficulties };
}

function angle_acuteness(angle: number): number {
    return smoothstep(angle, (140 * Math.PI) / 180, (40 * Math.PI) / 180);
}

function angle_wideness(angle: number): number {
    return smoothstep(angle, (40 * Math.PI) / 180, (140 * Math.PI) / 180);
}

function vector_angle_repetition(
    current: OsuDifficultyHitObject,
    previous: OsuDifficultyHitObject,
): number {
    if (current.angle == null || previous.angle == null) return 1;

    const note_limit = 6;
    const maximum_repetition_nerf = 0.15;
    const maximum_vector_influence = 0.5;
    let constant_angle_count = 0;

    for (let index = 0; index < note_limit; index++) {
        const previous_object = current.previous(index);
        if (!previous_object) break;

        if (
            Math.max(
                current.adjusted_delta_time,
                previous_object.adjusted_delta_time,
            ) >
            1.1 *
                Math.min(
                    current.adjusted_delta_time,
                    previous_object.adjusted_delta_time,
                )
        ) {
            break;
        }

        if (
            previous_object.normalised_vector_angle != null &&
            current.normalised_vector_angle != null
        ) {
            const angle_difference = Math.abs(
                current.normalised_vector_angle -
                    previous_object.normalised_vector_angle,
            );
            constant_angle_count += Math.cos(
                8 * Math.min((11.25 * Math.PI) / 180, angle_difference),
            );
        }
    }

    const vector_repetition = Math.min(0.5 / constant_angle_count, 1) ** 2;
    const stack_factor = smootherstep(
        current.lazy_jump_distance,
        0,
        NORMALISED_DIAMETER,
    );
    const angle_difference_adjusted = Math.cos(
        2 *
            Math.min(
                (45 * Math.PI) / 180,
                Math.abs(current.angle - previous.angle) * stack_factor,
            ),
    );
    const base_nerf =
        1 -
        maximum_repetition_nerf *
            angle_acuteness(previous.angle) *
            angle_difference_adjusted;

    return (
        (base_nerf +
            (1 - base_nerf) *
                vector_repetition *
                maximum_vector_influence *
                stack_factor) **
        2
    );
}

function evaluate_snap_aim(
    current: OsuDifficultyHitObject,
    with_slider_travel_distance: boolean,
): number {
    if (
        current.base_object.is_spinner ||
        current.index <= 1 ||
        current.previous(0)?.base_object.is_spinner
    )
        return 0;

    const previous = current.previous(0)!;
    const previous_previous = current.previous(2);
    let current_distance = with_slider_travel_distance
        ? current.lazy_jump_distance
        : current.jump_distance;
    const previous_distance = with_slider_travel_distance
        ? previous.lazy_jump_distance
        : previous.jump_distance;
    let current_velocity = current_distance / current.adjusted_delta_time;

    if (previous.base_object.is_slider && with_slider_travel_distance) {
        const slider_distance =
            (previous.base_object.lazy_travel_distance ?? 0) +
            current.lazy_jump_distance;
        current_velocity = Math.max(
            current_velocity,
            slider_distance / current.adjusted_delta_time,
        );
    }

    const previous_velocity = previous_distance / previous.adjusted_delta_time;
    let snap_difficulty =
        current_velocity * vector_angle_repetition(current, previous);

    if (current.angle != null && previous.angle != null) {
        const velocity_influence = Math.min(
            current_velocity,
            previous_velocity,
        );
        let acute_angle_bonus = 0;

        if (
            Math.max(
                current.adjusted_delta_time,
                previous.adjusted_delta_time,
            ) <
            1.25 *
                Math.min(
                    current.adjusted_delta_time,
                    previous.adjusted_delta_time,
                )
        ) {
            acute_angle_bonus = angle_acuteness(current.angle);
            acute_angle_bonus *=
                0.08 +
                0.92 *
                    (1 -
                        Math.min(
                            acute_angle_bonus,
                            angle_acuteness(previous.angle) ** 3,
                        ));
            acute_angle_bonus *=
                velocity_influence *
                smootherstep(
                    60000 / (current.adjusted_delta_time * 2),
                    300,
                    400,
                ) *
                smootherstep(current_distance, 0, NORMALISED_DIAMETER * 2);
        }

        let wide_angle_bonus = angle_wideness(current.angle);
        wide_angle_bonus *=
            0.25 +
            0.75 *
                (1 -
                    Math.min(
                        wide_angle_bonus,
                        angle_wideness(previous.angle) ** 3,
                    ));

        const wide_angle_time_scale = 1.45;
        let wide_angle_current_velocity =
            current_distance /
            current.adjusted_delta_time ** wide_angle_time_scale;
        const wide_angle_previous_velocity =
            previous_distance /
            previous.adjusted_delta_time ** wide_angle_time_scale;
        if (previous.base_object.is_slider && with_slider_travel_distance) {
            const slider_distance =
                (previous.base_object.lazy_travel_distance ?? 0) +
                current.lazy_jump_distance;
            wide_angle_current_velocity = Math.max(
                wide_angle_current_velocity,
                slider_distance /
                    current.adjusted_delta_time ** wide_angle_time_scale,
            );
        }

        wide_angle_bonus *= Math.min(
            wide_angle_current_velocity,
            wide_angle_previous_velocity,
        );

        if (previous_previous) {
            const previous_distance_raw = distance(
                {
                    x: previous_previous.base_object.stacked_x,
                    y: previous_previous.base_object.stacked_y,
                },
                {
                    x: previous.base_object.stacked_x,
                    y: previous.base_object.stacked_y,
                },
            );
            if (previous_distance_raw < 1)
                wide_angle_bonus *= 1 - 0.55 * (1 - previous_distance_raw);
        }

        snap_difficulty += Math.max(
            acute_angle_bonus * 2.41,
            wide_angle_bonus * 9.67,
        );

        const wiggle_bonus =
            velocity_influence *
            smootherstep(
                current_distance,
                NORMALISED_RADIUS,
                NORMALISED_DIAMETER,
            ) *
            reverse_lerp(
                current_distance,
                NORMALISED_DIAMETER * 3,
                NORMALISED_DIAMETER,
            ) **
                1.8 *
            smootherstep(
                current.angle,
                (110 * Math.PI) / 180,
                (60 * Math.PI) / 180,
            ) *
            smootherstep(
                previous_distance,
                NORMALISED_RADIUS,
                NORMALISED_DIAMETER,
            ) *
            reverse_lerp(
                previous_distance,
                NORMALISED_DIAMETER * 3,
                NORMALISED_DIAMETER,
            ) **
                1.8 *
            smootherstep(
                previous.angle,
                (110 * Math.PI) / 180,
                (60 * Math.PI) / 180,
            );

        snap_difficulty += wiggle_bonus * 1.02;
    }

    if (Math.max(previous_velocity, current_velocity) !== 0) {
        if (with_slider_travel_distance)
            current_velocity = current_distance / current.adjusted_delta_time;

        const distance_ratio = smoothstep(
            Math.abs(previous_velocity - current_velocity) /
                Math.max(previous_velocity, current_velocity),
            0,
            1,
        );
        const overlap_velocity_buff = Math.min(
            (NORMALISED_DIAMETER * 1.25) /
                Math.min(
                    current.adjusted_delta_time,
                    previous.adjusted_delta_time,
                ),
            Math.abs(previous_velocity - current_velocity),
        );
        let velocity_change_bonus = overlap_velocity_buff * distance_ratio;
        velocity_change_bonus *=
            (Math.min(
                current.adjusted_delta_time,
                previous.adjusted_delta_time,
            ) /
                Math.max(
                    current.adjusted_delta_time,
                    previous.adjusted_delta_time,
                )) **
            2;
        snap_difficulty += velocity_change_bonus * 0.9;
    }

    if (current.base_object.is_slider && with_slider_travel_distance) {
        const slider_bonus = current.travel_distance / current.travel_time;
        snap_difficulty +=
            (slider_bonus < 1 ? slider_bonus : slider_bonus ** 0.75) * 1.5;
    }

    snap_difficulty *= current.small_circle_bonus;
    snap_difficulty *= high_bpm_bonus(current.adjusted_delta_time, 0.03, 0.65);

    return snap_difficulty;
}

function evaluate_agility(current: OsuDifficultyHitObject): number {
    if (current.base_object.is_spinner) return 0;

    const previous = current.index > 0 ? current.previous(0) : undefined;
    const distance_value =
        (previous?.base_object.lazy_travel_distance ?? 0) +
        current.lazy_jump_distance;
    const distance_scaled =
        Math.min(distance_value, NORMALISED_DIAMETER * 1.2) /
        (NORMALISED_DIAMETER * 1.2);

    return (
        distance_scaled *
        (1000 / current.adjusted_delta_time) *
        current.small_circle_bonus ** 1.5 *
        high_bpm_bonus(current.adjusted_delta_time, 0.2)
    );
}

function calculate_overlap_factor(
    first: OsuDifficultyHitObject,
    second: OsuDifficultyHitObject,
): number {
    const object_radius = first.radius;
    const stacked_distance = distance(
        {
            x: first.base_object.stacked_x,
            y: first.base_object.stacked_y,
        },
        {
            x: second.base_object.stacked_x,
            y: second.base_object.stacked_y,
        },
    );
    return clamp(
        1 -
            (Math.max(stacked_distance - object_radius, 0) / object_radius) **
                2,
        0,
        1,
    );
}

function evaluate_flow_aim(
    current: OsuDifficultyHitObject,
    with_slider_travel_distance: boolean,
): number {
    if (
        current.base_object.is_spinner ||
        current.index <= 1 ||
        current.previous(0)?.base_object.is_spinner
    )
        return 0;

    const previous = current.previous(0)!;
    const previous_previous = current.previous(1)!;
    let current_distance = with_slider_travel_distance
        ? current.lazy_jump_distance
        : current.jump_distance;
    const previous_distance = with_slider_travel_distance
        ? previous.lazy_jump_distance
        : previous.jump_distance;
    let current_velocity = current_distance / current.adjusted_delta_time;

    if (previous.base_object.is_slider && with_slider_travel_distance) {
        const slider_distance =
            (previous.base_object.lazy_travel_distance ?? 0) +
            current.lazy_jump_distance;
        current_velocity = Math.max(
            current_velocity,
            slider_distance / current.adjusted_delta_time,
        );
    }

    const previous_velocity = previous_distance / previous.adjusted_delta_time;
    let flow_difficulty =
        current_velocity * Math.sqrt(current.small_circle_bonus);
    flow_difficulty *=
        1 +
        Math.min(
            0.25,
            ((Math.max(
                current.adjusted_delta_time,
                previous.adjusted_delta_time,
            ) -
                Math.min(
                    current.adjusted_delta_time,
                    previous.adjusted_delta_time,
                )) /
                50) **
                4,
        );

    if (current.angle != null && previous.angle != null) {
        const angle_difference = Math.abs(current.angle - previous.angle);
        const angle_difference_adjusted = Math.sin(angle_difference / 2) * 180;
        const angular_velocity =
            angle_difference_adjusted / (current.adjusted_delta_time * 0.1);
        flow_difficulty *= 0.8 + Math.sqrt(angular_velocity / 270);
    }

    let overlapped_notes_weight = 1;
    if (current.index > 2) {
        const first_overlap = calculate_overlap_factor(current, previous);
        const second_overlap = calculate_overlap_factor(
            current,
            previous_previous,
        );
        const third_overlap = calculate_overlap_factor(
            previous,
            previous_previous,
        );
        overlapped_notes_weight =
            1 - first_overlap * second_overlap * third_overlap;
    }

    if (current.angle != null) {
        flow_difficulty +=
            current_velocity *
            angle_acuteness(current.angle) *
            overlapped_notes_weight;
    }

    if (Math.max(previous_velocity, current_velocity) !== 0) {
        if (with_slider_travel_distance)
            current_velocity = current_distance / current.adjusted_delta_time;
        const distance_ratio = smoothstep(
            Math.abs(previous_velocity - current_velocity) /
                Math.max(previous_velocity, current_velocity),
            0,
            1,
        );
        const overlap_velocity_buff = Math.min(
            (NORMALISED_DIAMETER * 1.25) /
                Math.min(
                    current.adjusted_delta_time,
                    previous.adjusted_delta_time,
                ),
            Math.abs(previous_velocity - current_velocity),
        );
        flow_difficulty +=
            overlap_velocity_buff *
            distance_ratio *
            overlapped_notes_weight *
            0.52;
    }

    if (current.base_object.is_slider && with_slider_travel_distance) {
        flow_difficulty += current.travel_distance / current.travel_time;
    }

    return (
        flow_difficulty ** 1.45 *
        smootherstep(current_distance, 0, NORMALISED_RADIUS)
    );
}

function snap_flow_probability(ratio: number): number {
    if (ratio === 0) return 0;
    if (Number.isNaN(ratio)) return 1;
    return 1 / (1 + Math.exp(-7.27 * Math.log(ratio)));
}

function evaluate_aim(
    current: OsuDifficultyHitObject,
    include_sliders: boolean,
    mods: string[],
    current_strain: number,
): number {
    if (mods.includes("AP")) return 0;

    const decay = 0.2 ** (current.adjusted_delta_time / 1000);
    const snap_difficulty = evaluate_snap_aim(current, include_sliders) * 70.9;
    const agility_difficulty = evaluate_agility(current) * 2.35;
    const flow_difficulty = evaluate_flow_aim(current, include_sliders) * 242;
    const combined_snap_difficulty = norm(
        1.2,
        snap_difficulty,
        agility_difficulty,
    );
    const probability_snap = snap_flow_probability(
        flow_difficulty / combined_snap_difficulty,
    );
    let total_difficulty =
        combined_snap_difficulty * probability_snap +
        flow_difficulty * (1 - probability_snap);

    if (mods.includes("TD")) {
        const touch_snap_difficulty = snap_difficulty ** 0.89;
        total_difficulty =
            norm(1.2, touch_snap_difficulty, agility_difficulty) *
                probability_snap +
            flow_difficulty * (1 - probability_snap);
    }
    if (mods.includes("RX"))
        total_difficulty =
            combined_snap_difficulty * 0.75 * probability_snap +
            flow_difficulty * 0.6 * (1 - probability_snap);

    total_difficulty *= 1.12;
    total_difficulty *=
        0.985 + Math.max(0, current.overall_difficulty) ** 2 / 4000;

    return current_strain * decay + total_difficulty * (1 - decay);
}

export function calculate_jul2026_aim_skill(
    objects: OsuDifficultyHitObject[],
    include_sliders: boolean,
    mods: string[],
): {
    difficulty_value: number;
    aim_difficult_strain_count: number;
    difficult_slider_count: number;
    slider_strains: number[];
    object_difficulties: number[];
} {
    const slider_strains: number[] = [];
    const { peaks, object_difficulties } = calculate_strain_peaks(
        objects,
        (current, current_strain) => {
            const strain = evaluate_aim(
                current,
                include_sliders,
                mods,
                current_strain,
            );
            if (current.base_object.is_slider) slider_strains.push(strain);
            return strain;
        },
        (ms) => 0.2 ** (ms / 1000),
    );

    const reduced_peaks = peaks.filter((peak) => peak.value > 0);
    const chunk_size = 20;
    let time = 0;
    let skip_count = 0;

    while (reduced_peaks.length > skip_count && time < 4000) {
        const peak = reduced_peaks[skip_count]!;
        for (
            let added_time = 0;
            added_time < peak.section_length;
            added_time += chunk_size
        ) {
            const scale = Math.log10(
                lerp(1, 10, clamp((time + added_time) / 4000, 0, 1)),
            );
            reduced_peaks.push({
                value: peak.value * lerp(0.727, 1, scale),
                section_length: round_to_even(
                    Math.min(chunk_size, peak.section_length - added_time),
                ),
            });
        }
        time += peak.section_length;
        skip_count++;
    }

    let difficulty_value = 0;
    time = 0;
    for (const peak of reduced_peaks
        .slice(skip_count)
        .sort((first, second) => second.value - first.value)) {
        const start_time = time;
        const end_time = time + peak.section_length / 400;
        const weight = 0.9 ** start_time - 0.9 ** end_time;
        difficulty_value += peak.value * weight;
        time = end_time;
    }
    difficulty_value /= 1 - 0.9;

    const max_slider_strain = slider_strains.length
        ? Math.max(...slider_strains)
        : 0;
    const difficult_slider_count =
        max_slider_strain === 0
            ? 0
            : slider_strains.reduce(
                  (sum, strain) =>
                      sum +
                      1 /
                          (1 +
                              Math.exp(
                                  -((strain / max_slider_strain) * 12 - 6),
                              )),
                  0,
              );

    return {
        difficulty_value,
        aim_difficult_strain_count: count_top_weighted_strains(
            object_difficulties,
            difficulty_value,
            0.9,
        ),
        difficult_slider_count,
        slider_strains,
        object_difficulties,
    };
}

type JulSpeedResult = HarmonicResult & {
    speed_difficult_strain_count: number;
    speed_note_count: number;
    slider_strains: number[];
};

class JulRhythmIsland {
    delta: number;
    delta_count = 1;
    occurrences = 1;

    constructor(delta: number) {
        this.delta = Math.max(delta, 25);
    }

    add_delta(delta: number): void {
        if (this.delta === Number.MAX_SAFE_INTEGER)
            this.delta = Math.max(delta, 25);
        this.delta_count++;
    }

    is_similar_polarity(other: JulRhythmIsland, epsilon: number): boolean {
        return (
            this.delta_count > 1 &&
            other.delta_count > 1 &&
            Math.abs(this.delta - other.delta) < epsilon &&
            this.delta_count % 2 === other.delta_count % 2
        );
    }

    almost_equals(other: JulRhythmIsland, epsilon: number): boolean {
        return (
            Math.abs(this.delta - other.delta) < epsilon &&
            this.delta_count === other.delta_count
        );
    }
}

export function evaluate_jul2026_speed_difficulty(
    current: OsuDifficultyHitObject,
): number {
    if (current.base_object.is_spinner) return 0;

    const strain_time = current.adjusted_delta_time;
    const doubletap_feasibility =
        1 - current.get_doubletapness(current.next(0));
    const capped_strain_time =
        strain_time /
        clamp(strain_time / current.hit_window_great / 0.93, 0.92, 1);

    let speed_bonus = 0;
    if (60000 / (capped_strain_time * 4) > 200) {
        speed_bonus = 0.75 * ((60000 / 4 / 200 - capped_strain_time) / 40) ** 2;
    }

    const speed_difficulty = ((1 + speed_bonus) * 1000) / capped_strain_time;
    const high_bpm_bonus = 1 / (1 - 0.3 ** (strain_time / 1000));

    return speed_difficulty * high_bpm_bonus * doubletap_feasibility;
}

export function evaluate_jul2026_rhythm_difficulty(
    current: OsuDifficultyHitObject,
): number {
    if (current.base_object.is_spinner) return 0;

    const history_time_max = 5000;
    const history_objects_max = 32;
    const delta_difference_epsilon = current.hit_window_great * 0.3;

    let rhythm_complexity_sum = 0;
    let island = new JulRhythmIsland(Number.MAX_SAFE_INTEGER);
    let previous_island = new JulRhythmIsland(Number.MAX_SAFE_INTEGER);
    const islands: JulRhythmIsland[] = [];
    let start_difficulty = 0;
    let first_delta_switch = false;

    const historical_note_count = Math.min(current.index, history_objects_max);
    let rhythm_start = 0;
    while (
        rhythm_start < historical_note_count - 2 &&
        current.start_time - current.previous(rhythm_start)!.start_time <
            history_time_max
    )
        rhythm_start++;

    let previous = current.previous(rhythm_start);
    let previous_previous = current.previous(rhythm_start + 1);

    for (let i = rhythm_start; i > 0; i--) {
        const current_object = current.previous(i - 1);
        if (!current_object || !previous || !previous_previous) continue;
        if (current_object.base_object.is_spinner) continue;

        const historical_decay = Math.min(
            (history_time_max -
                (current.start_time - current_object.start_time)) /
                history_time_max,
            (historical_note_count - i) / historical_note_count,
        );
        const min_delta = 1e-7;
        const current_delta = Math.max(current_object.delta_time, min_delta);
        const previous_delta = Math.max(previous.delta_time, min_delta);
        const previous_previous_delta = Math.max(
            previous_previous.delta_time,
            min_delta,
        );
        const delta_difference = Math.abs(previous_delta - current_delta);
        const delta_ratio =
            Math.max(previous_delta, current_delta) /
            Math.min(previous_delta, current_delta);

        if (island.delta === Number.MAX_SAFE_INTEGER)
            island = new JulRhythmIsland(Math.trunc(current_delta));

        const difference_multiplier = clamp(2 - delta_ratio / 8, 0, 1);
        const window_penalty = clamp(
            (delta_difference - delta_difference_epsilon) /
                delta_difference_epsilon,
            0,
            1,
        );

        const effective_ratio = (ratio: number) =>
            1 +
            26 *
                Math.min(0.5, smoothstep_bell_curve(ratio - Math.trunc(ratio)));

        let effective_difficulty =
            effective_ratio(delta_ratio) *
            window_penalty *
            difference_multiplier;

        if (previous.base_object.is_slider) {
            const lazy_ratio =
                Math.max(current_object.minimum_jump_time, current_delta) /
                Math.min(current_object.minimum_jump_time, current_delta);
            const real_ratio =
                Math.max(
                    current_object.last_object_end_delta_time,
                    current_delta,
                ) /
                Math.min(
                    current_object.last_object_end_delta_time,
                    current_delta,
                );
            effective_difficulty = Math.min(
                effective_difficulty,
                effective_ratio(lazy_ratio),
                effective_ratio(real_ratio),
            );
        }

        if (delta_difference < delta_difference_epsilon)
            island.add_delta(Math.trunc(current_delta));

        if (first_delta_switch) {
            if (delta_difference > delta_difference_epsilon) {
                if (current_object.base_object.is_slider)
                    effective_difficulty *= 0.5;
                if (
                    island.is_similar_polarity(
                        previous_island,
                        delta_difference_epsilon,
                    )
                )
                    effective_difficulty *= 0.5;
                if (
                    previous_previous_delta >
                        previous_delta + delta_difference_epsilon &&
                    previous_delta > current_delta + delta_difference_epsilon
                )
                    effective_difficulty *= 0.125;
                if (previous_island.delta_count === island.delta_count)
                    effective_difficulty *= 0.5;
                if (previous_delta > current_delta + delta_difference_epsilon)
                    effective_difficulty *= 0.65;

                let found = false;
                for (const existing of islands) {
                    if (
                        existing.almost_equals(island, delta_difference_epsilon)
                    ) {
                        if (
                            previous_island.almost_equals(
                                island,
                                delta_difference_epsilon,
                            )
                        )
                            existing.occurrences++;

                        const power = logistic(island.delta, 58.33, 0.24, 2.75);
                        effective_difficulty *= Math.min(
                            3 / existing.occurrences,
                            (1 / existing.occurrences) ** power,
                        );
                        found = true;
                        break;
                    }
                }
                if (!found && island.delta_count > 0) islands.push(island);

                effective_difficulty *=
                    1 - previous.get_doubletapness(current_object) * 0.75;

                if (island.delta_count > 1)
                    rhythm_complexity_sum +=
                        Math.sqrt(effective_difficulty * start_difficulty) *
                        historical_decay;
                else rhythm_complexity_sum += 0.7 * historical_decay;

                start_difficulty = effective_difficulty;
                if (previous_delta + delta_difference_epsilon < current_delta)
                    first_delta_switch = false;

                previous_island = island;
                island = new JulRhythmIsland(Math.trunc(current_delta));
            }
        } else if (previous_delta > current_delta + delta_difference_epsilon) {
            first_delta_switch = true;
            if (current_object.base_object.is_slider)
                effective_difficulty *= 0.6;
            if (previous.base_object.is_slider) effective_difficulty *= 0.6;
            start_difficulty = effective_difficulty;
            island = new JulRhythmIsland(Math.trunc(current_delta));
        }

        previous_previous = previous;
        previous = current_object;
    }

    rhythm_complexity_sum *= reverse_lerp(island.delta_count, 22, 3);
    return Math.sqrt(4 + rhythm_complexity_sum * 0.95) / 2;
}

export function calculate_jul2026_speed_skill(
    objects: OsuDifficultyHitObject[],
    mods: string[],
): JulSpeedResult {
    const slider_strains: number[] = [];
    const object_difficulties: number[] = [];
    const strain_peaks: number[] = [];
    let current_strain = 0;
    let current_rhythm = 0;
    let current_section_peak = 0;
    let current_section_end = 0;

    for (let index = 0; index < objects.length; index++) {
        const current = objects[index]!;

        if (index === 0)
            current_section_end = Math.ceil(current.start_time / 400) * 400;

        while (current.start_time > current_section_end) {
            strain_peaks.push(current_section_peak);
            const previous = current.previous(0);
            current_section_peak = previous
                ? current_strain *
                  current_rhythm *
                  0.3 ** ((current_section_end - previous.start_time) / 1000)
                : current_strain * current_rhythm;
            current_section_end += 400;
        }

        const decay = 0.3 ** (current.adjusted_delta_time / 1000);
        current_strain *= decay;
        let difficulty = evaluate_jul2026_speed_difficulty(current);
        if (mods.includes("AP")) difficulty *= 0.5;
        current_strain += difficulty * (1 - decay) * 1.16;
        current_rhythm = evaluate_jul2026_rhythm_difficulty(current);

        const total_strain = current_strain * current_rhythm;
        if (current.base_object.is_slider) slider_strains.push(total_strain);
        object_difficulties.push(total_strain);
        current_section_peak = Math.max(current_section_peak, total_strain);
    }

    const harmonic = calculate_harmonic_difficulty(
        object_difficulties,
        20,
        0.9,
    );
    const max_strain =
        object_difficulties.length > 0 ? Math.max(...object_difficulties) : 0;

    return {
        ...harmonic,
        slider_strains,
        speed_difficult_strain_count:
            harmonic.object_weight_sum > 0
                ? count_top_weighted_object_difficulties(
                      object_difficulties,
                      harmonic.difficulty_value,
                      harmonic.object_weight_sum,
                  )
                : 0,
        speed_note_count:
            max_strain > 0
                ? object_difficulties.reduce(
                      (sum, strain) =>
                          sum +
                          1 / (1 + Math.exp(-((strain / max_strain) * 12 - 6))),
                      0,
                  )
                : 0,
    };
}

function evaluate_jul2026_reading_difficulty(
    current: OsuDifficultyHitObject,
    hidden: boolean,
): number {
    if (current.base_object.is_spinner || current.index === 0) return 0;

    const next = current.next(0);
    const velocity = Math.max(
        1,
        current.lazy_jump_distance / current.adjusted_delta_time,
    );
    const current_density = retrieve_current_visible_density(current);
    const past_influence = get_past_object_difficulty_influence(current);
    const angle_nerf = get_constant_angle_nerf_factor(current);

    const note_density = calculate_density_difficulty(
        next,
        velocity,
        angle_nerf,
        past_influence,
        current_density,
    );
    const hidden_difficulty = hidden
        ? calculate_hidden_reading_difficulty(
              current,
              past_influence,
              current_density,
              velocity,
              angle_nerf,
          )
        : 0;
    const preempt_difficulty = calculate_preempt_difficulty(
        velocity,
        angle_nerf,
        current.time_preempt,
    );

    let result = norm(1.5, preempt_difficulty, hidden_difficulty, note_density);
    result *= 1 / (1 - 0.8 ** (current.adjusted_delta_time / 1000));
    return result;
}

const READING_WINDOW_SIZE = 3000;
const DISTANCE_INFLUENCE_THRESHOLD = NORMALISED_DIAMETER * 1.5;

function calculate_density_difficulty(
    next: OsuDifficultyHitObject | undefined,
    velocity: number,
    angle_nerf: number,
    past_influence: number,
    current_density: number,
): number {
    const future_influence =
        Math.sqrt(current_density) *
        (next
            ? smootherstep(
                  next.lazy_jump_distance,
                  15,
                  DISTANCE_INFLUENCE_THRESHOLD,
              )
            : 1);
    let result =
        (past_influence + future_influence) ** 1.7 *
        0.4 *
        angle_nerf *
        velocity;
    result = Math.max(0, result - 2.5);
    return result ** 0.45 * 2.4;
}

function calculate_preempt_difficulty(
    velocity: number,
    angle_nerf: number,
    preempt: number,
): number {
    const preempt_starting_point = 500;
    const preempt_factor =
        (preempt_starting_point -
            preempt +
            Math.abs(preempt - preempt_starting_point)) /
        2;
    return (preempt_factor ** 2.5 / 140000) * angle_nerf * velocity;
}

function calculate_hidden_reading_difficulty(
    current: OsuDifficultyHitObject,
    past_influence: number,
    current_density: number,
    velocity: number,
    angle_nerf: number,
): number {
    const preempt_factor = current.time_preempt ** 2.2 * 0.01;
    const density_factor = (current_density + past_influence) ** 3.3 * 3;
    let result =
        (preempt_factor + density_factor) * angle_nerf * velocity * 0.01;
    result = result ** 0.4 * 0.28;

    const previous = current.previous(0);
    if (
        previous &&
        current.lazy_jump_distance === 0 &&
        current.opacity_at(previous.base_object.time, true) === 0 &&
        previous.start_time > current.start_time - current.time_preempt
    ) {
        result += (0.28 * 2500) / current.adjusted_delta_time ** 1.5;
    }
    return result;
}

function get_time_nerf_factor(delta_time: number): number {
    return clamp(2 - delta_time / (READING_WINDOW_SIZE / 2), 0, 1);
}

function get_past_object_difficulty_influence(
    current: OsuDifficultyHitObject,
): number {
    let result = 0;
    for (let index = 0; index < current.index; index++) {
        const previous = current.previous(index);
        if (
            !previous ||
            current.start_time - previous.start_time > READING_WINDOW_SIZE ||
            previous.start_time < current.start_time - current.time_preempt
        )
            break;

        let difficulty = current.opacity_at(previous.base_object.time, false);
        difficulty *= smootherstep(
            previous.lazy_jump_distance,
            15,
            DISTANCE_INFLUENCE_THRESHOLD,
        );
        difficulty *= get_time_nerf_factor(
            current.start_time - previous.start_time,
        );
        result += difficulty;
    }
    return result;
}

function retrieve_current_visible_density(
    current: OsuDifficultyHitObject,
): number {
    let result = 0;
    let next = current.next(0);

    while (next) {
        if (
            next.start_time - current.start_time > READING_WINDOW_SIZE ||
            current.start_time < next.start_time - next.time_preempt
        )
            break;

        result +=
            next.opacity_at(current.base_object.time, false) *
            get_time_nerf_factor(next.start_time - current.start_time);
        next = next.next(0);
    }
    return result;
}

function get_constant_angle_nerf_factor(
    current: OsuDifficultyHitObject,
): number {
    const minimum_angle_relevancy_time = 2000;
    const maximum_angle_relevancy_time = 200;
    let constant_angle_count = 0;
    let index = 0;
    let current_time_gap = 0;
    let loop_previous_0 = current;
    let loop_previous_1: OsuDifficultyHitObject | undefined;
    let loop_previous_2: OsuDifficultyHitObject | undefined;

    while (current_time_gap < minimum_angle_relevancy_time) {
        const loop_object = current.previous(index);
        if (!loop_object) break;

        const long_interval_factor =
            1 -
            reverse_lerp(
                loop_object.adjusted_delta_time,
                maximum_angle_relevancy_time,
                minimum_angle_relevancy_time,
            );

        if (loop_object.angle != null && current.angle != null) {
            const angle_difference = Math.abs(
                current.angle - loop_object.angle,
            );
            let alternating = Math.PI;

            if (
                loop_previous_0.angle != null &&
                loop_previous_1?.angle != null &&
                loop_previous_2?.angle != null
            ) {
                alternating =
                    Math.abs(loop_previous_1.angle - loop_object.angle) +
                    Math.abs(loop_previous_2.angle - loop_previous_0.angle);

                let weight = 1;
                weight *= reverse_lerp(
                    (Math.min(loop_object.angle, loop_previous_0.angle) * 180) /
                        Math.PI,
                    20,
                    5,
                );
                weight *= reverse_lerp(
                    (Math.max(loop_object.angle, loop_previous_0.angle) * 180) /
                        Math.PI,
                    60,
                    120,
                );
                alternating = lerp(Math.PI, 0.1 * alternating, weight);
            }

            const stack_factor = smootherstep(
                loop_object.lazy_jump_distance,
                0,
                NORMALISED_RADIUS,
            );
            const relevant_angle = Math.min(angle_difference, alternating);
            constant_angle_count +=
                Math.cos(
                    3 *
                        Math.min(
                            (30 * Math.PI) / 180,
                            relevant_angle * stack_factor,
                        ),
                ) * long_interval_factor;
        }

        current_time_gap = current.start_time - loop_object.start_time;
        index++;
        loop_previous_2 = loop_previous_1;
        loop_previous_1 = loop_previous_0;
        loop_previous_0 = loop_object;
    }

    return clamp(2 / constant_angle_count, 0.2, 1);
}

export function calculate_jul2026_reading_skill(
    objects: OsuDifficultyHitObject[],
    mods: string[],
): HarmonicResult & { reading_difficult_note_count: number } {
    const object_difficulties: number[] = [];
    const object_list: OsuDifficultyHitObject[] = [];
    let current_strain = 0;
    const hidden = mods.includes("HD");

    for (const current of objects) {
        object_list.push(current);
        const decay = 0.8 ** (current.delta_time / 1000);
        current_strain *= decay;

        let difficulty = evaluate_jul2026_reading_difficulty(current, hidden);
        if (mods.includes("TD")) difficulty = difficulty ** 0.89;
        if (mods.includes("RX")) difficulty *= 0.4;
        if (mods.includes("AP")) difficulty *= 0.1;
        difficulty *=
            0.825 + Math.max(0, current.overall_difficulty) ** 2.2 / 1125;

        current_strain += difficulty * (1 - decay) * 2.5;
        object_difficulties.push(current_strain);
    }

    const reduced_note_count =
        object_list.length > 0
            ? object_list.filter(
                  (object) =>
                      object.start_time <= object_list[0]!.start_time + 60000,
              ).length
            : 0;

    const harmonic = calculate_harmonic_difficulty(
        object_difficulties,
        1,
        0.9,
        (values) => {
            const transformed = values.filter((value) => value > 0);
            for (
                let index = 0;
                index < Math.min(transformed.length, reduced_note_count);
                index++
            ) {
                const scale = Math.log10(
                    lerp(1, 10, clamp(index / reduced_note_count, 0, 1)),
                );
                transformed[index]! *= lerp(0, 1, scale);
            }
            return transformed;
        },
    );

    const consistent_top_note =
        harmonic.object_weight_sum > 0
            ? harmonic.difficulty_value / harmonic.object_weight_sum
            : 0;
    const reading_difficult_note_count =
        consistent_top_note > 0
            ? object_difficulties.reduce(
                  (sum, difficulty) =>
                      sum +
                      logistic(difficulty / consistent_top_note, 1.15, 5, 1.1),
                  0,
              )
            : 0;

    return { ...harmonic, reading_difficult_note_count };
}

function evaluate_jul2026_flashlight_difficulty(
    current: OsuDifficultyHitObject,
    mods: string[],
): number {
    if (current.base_object.is_spinner) return 0;

    const scaling_factor = 52 / current.radius;
    let small_dist_nerf = 1;
    let cumulative_strain_time = 0;
    let flashlight_difficulty = 0;
    let last_object = current;
    let angle_repeat_count = 0;

    for (let i = 0; i < Math.min(current.index, 10); i++) {
        const previous = current.previous(i);
        if (!previous) break;

        cumulative_strain_time += last_object.adjusted_delta_time;

        if (!previous.base_object.is_spinner) {
            const delta_x = Math.fround(
                current.base_object.stacked_x - previous.end_position.x,
            );
            const delta_y = Math.fround(
                current.base_object.stacked_y - previous.end_position.y,
            );
            const jump_distance = Math.fround(
                Math.sqrt(
                    Math.fround(
                        Math.fround(delta_x * delta_x) +
                            Math.fround(delta_y * delta_y),
                    ),
                ),
            );
            if (i === 0) small_dist_nerf = Math.min(1, jump_distance / 75);

            const stack_nerf = Math.min(
                1,
                previous.lazy_jump_distance / scaling_factor / 25,
            );
            const opacity_bonus =
                1 +
                0.4 *
                    (1 -
                        current.opacity_at(
                            previous.base_object.time,
                            mods.includes("HD"),
                        ));

            flashlight_difficulty +=
                (stack_nerf * opacity_bonus * scaling_factor * jump_distance) /
                cumulative_strain_time;

            if (
                previous.angle != null &&
                current.angle != null &&
                Math.abs(previous.angle - current.angle) < 0.02
            )
                angle_repeat_count += Math.max(1 - 0.1 * i, 0);
        }

        last_object = previous;
    }

    flashlight_difficulty = (small_dist_nerf * flashlight_difficulty) ** 2;
    if (mods.includes("HD")) flashlight_difficulty *= 1.2;
    flashlight_difficulty *= 0.2 + 0.8 / (angle_repeat_count + 1);

    let slider_bonus = 0;
    if (current.base_object.is_slider) {
        const pixel_travel_distance =
            (current.base_object.lazy_travel_distance ?? 0) / scaling_factor;
        slider_bonus =
            Math.max(0, pixel_travel_distance / current.travel_time - 0.5) **
            0.5;
        slider_bonus *= pixel_travel_distance;

        const repeat_count = (current.base_object.slider_span_count ?? 1) - 1;
        if (repeat_count > 0) slider_bonus /= repeat_count + 1;
    }

    return flashlight_difficulty + slider_bonus * 1.3;
}

export function calculate_jul2026_flashlight_skill(
    objects: OsuDifficultyHitObject[],
    mods: string[],
): { difficulty_value: number; flashlight_rating: number } {
    let current_strain = 0;
    let current_section_peak = 0;
    let current_section_end = 0;
    const strain_peaks: number[] = [];

    for (let index = 0; index < objects.length; index++) {
        const current = objects[index]!;

        if (index === 0)
            current_section_end = Math.ceil(current.start_time / 400) * 400;

        while (current.start_time > current_section_end) {
            strain_peaks.push(current_section_peak);
            const previous = current.previous(0);
            current_section_peak = previous
                ? current_strain *
                  0.15 ** ((current_section_end - previous.start_time) / 1000)
                : current_strain;
            current_section_end += 400;
        }

        current_strain *= 0.15 ** (current.delta_time / 1000);
        current_strain +=
            evaluate_jul2026_flashlight_difficulty(current, mods) *
            (0.985 + Math.max(0, current.overall_difficulty) ** 2 / 4000) *
            0.058;
        current_section_peak = Math.max(current_section_peak, current_strain);
    }

    const difficulty_value =
        strain_peaks.reduce((sum, value) => sum + value, 0) +
        current_section_peak;
    const total_objects = objects.length + 1;
    const adjusted_difficulty =
        difficulty_value *
        (0.7 +
            0.1 * Math.min(1, total_objects / 200) +
            (total_objects > 200
                ? 0.2 * Math.min(1, (total_objects - 200) / 200)
                : 0));

    return {
        difficulty_value: adjusted_difficulty,
        flashlight_rating: Math.sqrt(adjusted_difficulty) * 0.0675,
    };
}
