import type { BeatmapData, HitObject } from "../BeatmapData";
import { prepare_hit_objects_for_difficulty } from "../mar2025/DifficultyCalculator";

const DIFFICULTY_MULTIPLIER = 0.0675;
const SECTION_LENGTH = 400;
const MIN_DELTA_TIME = 25;
const NORMALIZED_RADIUS = 50;
const MAXIMUM_SLIDER_RADIUS = NORMALIZED_RADIUS * 2.4;
const ASSUMED_SLIDER_RADIUS = NORMALIZED_RADIUS * 1.8;

export interface Nov2021DifficultyAttributes {
    star_rating: number;
    max_combo: number;
    aim_strain: number;
    speed_strain: number;
    flashlight_rating: number;
    slider_factor: number;
    approach_rate: number;
    overall_difficulty: number;
    circle_size: number;
    drain_rate: number;
    hit_circle_count: number;
    slider_count: number;
    spinner_count: number;
}

interface ModdedBeatmap {
    beatmap: BeatmapData;
    mods: string[];
    clock_rate: number;
    ar: number;
    od: number;
    cs: number;
    hp: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function difficulty_range(
    difficulty: number,
    min: number,
    mid: number,
    max: number,
): number {
    if (difficulty > 5) return mid + ((max - mid) * (difficulty - 5)) / 5;
    if (difficulty < 5) return mid - ((mid - min) * (5 - difficulty)) / 5;
    return mid;
}

function circle_scale(circle_size: number): number {
    return Math.fround((1 - (0.7 * (circle_size - 5)) / 5) / 2);
}

function clone_for_mods(
    beatmap: BeatmapData,
    ar: number,
    cs: number,
    hr: boolean,
) {
    const hit_objects = prepare_hit_objects_for_difficulty(
        beatmap,
        hr ? ["HR"] : [],
        cs,
        ar,
        "nov2021",
    );

    return {
        ...beatmap,
        hit_objects,
    };
}

function apply_mods(beatmap: BeatmapData, mods: string[]): ModdedBeatmap {
    const has = (mod: string) => mods.includes(mod);
    const clock_rate = has("DT") || has("NC") ? 1.5 : has("HT") ? 0.75 : 1;

    let ar = beatmap.ar;
    let od = beatmap.od;
    let cs = beatmap.cs;
    let hp = beatmap.hp;

    if (has("HR")) {
        ar = Math.min(ar * 1.4, 10);
        od = Math.min(od * 1.4, 10);
        cs = Math.min(cs * 1.3, 10);
        hp = Math.min(hp * 1.4, 10);
    }
    if (has("EZ")) {
        ar *= 0.5;
        od *= 0.5;
        cs *= 0.5;
        hp *= 0.5;
    }

    return {
        beatmap: clone_for_mods(beatmap, ar, cs, has("HR")),
        mods,
        clock_rate,
        ar,
        od,
        cs,
        hp,
    };
}

function distance(
    first: { x: number; y: number },
    second: { x: number; y: number },
): number {
    const dx = Math.fround(first.x - second.x);
    const dy = Math.fround(first.y - second.y);
    return Math.fround(
        Math.sqrt(Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy))),
    );
}

function end_position(object: HitObject): { x: number; y: number } {
    return {
        x: object.tail_x ?? object.end_x ?? object.x,
        y: object.tail_y ?? object.end_y ?? object.y,
    };
}

function stacked_end_position(object: HitObject): { x: number; y: number } {
    const end = end_position(object);
    const offset = {
        x: object.stacked_x - object.x,
        y: object.stacked_y - object.y,
    };
    return { x: end.x + offset.x, y: end.y + offset.y };
}

function lazy_end_position(object: HitObject): { x: number; y: number } {
    if (
        object.is_slider &&
        object.lazy_end_x != null &&
        object.lazy_end_y != null
    ) {
        const offset = {
            x: object.stacked_x - object.x,
            y: object.stacked_y - object.y,
        };
        return {
            x: object.lazy_end_x + offset.x,
            y: object.lazy_end_y + offset.y,
        };
    }
    return { x: object.stacked_x, y: object.stacked_y };
}

class Nov2021DifficultyHitObject {
    readonly base_object: HitObject;
    readonly last_object: HitObject;
    readonly last_last_object: HitObject | null;
    readonly delta_time: number;
    readonly start_time: number;
    readonly strain_time: number;
    readonly radius: number;
    readonly index: number;

    jump_distance = 0;
    movement_distance = 0;
    travel_distance = 0;
    movement_time = 0;
    travel_time = 0;
    angle: number | null = null;

    constructor(
        base_object: HitObject,
        last_object: HitObject,
        last_last_object: HitObject | null,
        clock_rate: number,
        cs: number,
        index: number,
    ) {
        this.base_object = base_object;
        this.last_object = last_object;
        this.last_last_object = last_last_object;
        this.delta_time = (base_object.time - last_object.time) / clock_rate;
        this.start_time = base_object.time / clock_rate;
        this.strain_time = Math.max(this.delta_time, MIN_DELTA_TIME);
        this.radius = Math.fround(64 * circle_scale(cs));
        this.index = index;

        this.set_distances(clock_rate);
    }

    private set_distances(clock_rate: number): void {
        if (this.base_object.is_spinner || this.last_object.is_spinner) return;

        let scaling_factor = Math.fround(NORMALIZED_RADIUS / this.radius);
        if (this.radius < 30) {
            scaling_factor = Math.fround(
                scaling_factor * (1 + Math.min(30 - this.radius, 5) / 50),
            );
        }

        const last_cursor_position = lazy_end_position(this.last_object);
        this.jump_distance =
            distance(
                {
                    x: this.base_object.stacked_x,
                    y: this.base_object.stacked_y,
                },
                last_cursor_position,
            ) * scaling_factor;

        if (this.last_object.is_slider) {
            this.travel_distance = this.last_object.lazy_travel_distance ?? 0;
            this.travel_time = Math.max(
                (this.last_object.lazy_travel_time ??
                    this.last_object.slider_duration ??
                    0) / clock_rate,
                MIN_DELTA_TIME,
            );
            this.movement_time = Math.max(
                this.strain_time - this.travel_time,
                MIN_DELTA_TIME,
            );

            const tail_jump_distance =
                distance(stacked_end_position(this.last_object), {
                    x: this.base_object.stacked_x,
                    y: this.base_object.stacked_y,
                }) * scaling_factor;
            this.movement_distance = Math.max(
                0,
                Math.min(
                    this.jump_distance -
                        (MAXIMUM_SLIDER_RADIUS - ASSUMED_SLIDER_RADIUS),
                    tail_jump_distance - MAXIMUM_SLIDER_RADIUS,
                ),
            );
        } else {
            this.movement_time = this.strain_time;
            this.movement_distance = this.jump_distance;
        }

        if (this.last_last_object && !this.last_last_object.is_spinner) {
            const last_last_cursor_position = lazy_end_position(
                this.last_last_object,
            );
            const v1 = {
                x: Math.fround(
                    last_last_cursor_position.x - this.last_object.stacked_x,
                ),
                y: Math.fround(
                    last_last_cursor_position.y - this.last_object.stacked_y,
                ),
            };
            const v2 = {
                x: Math.fround(
                    this.base_object.stacked_x - last_cursor_position.x,
                ),
                y: Math.fround(
                    this.base_object.stacked_y - last_cursor_position.y,
                ),
            };
            const dot = Math.fround(
                Math.fround(v1.x * v2.x) + Math.fround(v1.y * v2.y),
            );
            const det = Math.fround(
                Math.fround(v1.x * v2.y) - Math.fround(v1.y * v2.x),
            );
            this.angle = Math.abs(Math.atan2(det, dot));
        }
    }
}

function strain_decay(ms: number, base: number): number {
    return base ** (ms / 1000);
}

function reduce_strain_peaks(
    peaks: number[],
    reduced_section_count: number,
    reduced_strain_baseline: number,
    decay_weight: number,
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
        weight *= decay_weight;
    }
    return difficulty * difficulty_multiplier;
}

function wide_angle_bonus(angle: number): number {
    return (
        Math.sin(
            (3 / 4) *
                (clamp(angle, Math.PI / 6, (5 * Math.PI) / 6) - Math.PI / 6),
        ) ** 2
    );
}

function acute_angle_bonus(angle: number): number {
    return 1 - wide_angle_bonus(angle);
}

function calculate_aim_strain_value(
    current: Nov2021DifficultyHitObject,
    previous: Nov2021DifficultyHitObject[],
    with_sliders: boolean,
): number {
    if (
        current.base_object.is_spinner ||
        previous.length <= 1 ||
        previous[0]!.base_object.is_spinner
    ) {
        return 0;
    }

    const last = previous[0]!;
    const last_last = previous[1]!;
    let current_velocity = current.jump_distance / current.strain_time;
    if (last.base_object.is_slider && with_sliders) {
        const movement_velocity =
            current.movement_distance / current.movement_time;
        const travel_velocity = current.travel_distance / current.travel_time;
        current_velocity = Math.max(
            current_velocity,
            movement_velocity + travel_velocity,
        );
    }

    let previous_velocity = last.jump_distance / last.strain_time;
    if (last_last.base_object.is_slider && with_sliders) {
        const movement_velocity = last.movement_distance / last.movement_time;
        const travel_velocity = last.travel_distance / last.travel_time;
        previous_velocity = Math.max(
            previous_velocity,
            movement_velocity + travel_velocity,
        );
    }

    let wide_bonus = 0;
    let acute_bonus = 0;
    let slider_bonus = 0;
    let velocity_change_bonus = 0;

    let aim_strain = current_velocity;
    if (
        Math.max(current.strain_time, last.strain_time) <
        1.25 * Math.min(current.strain_time, last.strain_time)
    ) {
        if (
            current.angle != null &&
            last.angle != null &&
            last_last.angle != null
        ) {
            const angle_bonus = Math.min(current_velocity, previous_velocity);
            wide_bonus = wide_angle_bonus(current.angle);
            acute_bonus = acute_angle_bonus(current.angle);

            if (current.strain_time > 100) {
                acute_bonus = 0;
            } else {
                acute_bonus *=
                    acute_angle_bonus(last.angle) *
                    Math.min(angle_bonus, 125 / current.strain_time) *
                    Math.sin(
                        (Math.PI / 2) *
                            Math.min(1, (100 - current.strain_time) / 25),
                    ) **
                        2 *
                    Math.sin(
                        ((Math.PI / 2) *
                            (clamp(current.jump_distance, 50, 100) - 50)) /
                            50,
                    ) **
                        2;
            }

            wide_bonus *=
                angle_bonus *
                (1 - Math.min(wide_bonus, wide_angle_bonus(last.angle) ** 3));
            acute_bonus *=
                0.5 +
                0.5 *
                    (1 -
                        Math.min(
                            acute_bonus,
                            acute_angle_bonus(last_last.angle) ** 3,
                        ));
        }
    }

    if (Math.max(previous_velocity, current_velocity) !== 0) {
        previous_velocity =
            (last.jump_distance + last.travel_distance) / last.strain_time;
        current_velocity =
            (current.jump_distance + current.travel_distance) /
            current.strain_time;

        const velocity_difference = Math.abs(
            previous_velocity - current_velocity,
        );
        const distance_ratio =
            Math.sin(
                (Math.PI / 2) *
                    (velocity_difference /
                        Math.max(previous_velocity, current_velocity)),
            ) ** 2;
        const overlap_velocity_buff = Math.min(
            125 / Math.min(current.strain_time, last.strain_time),
            velocity_difference,
        );
        const non_overlap_velocity_buff =
            velocity_difference *
            Math.sin(
                (Math.PI / 2) *
                    Math.min(
                        1,
                        Math.min(current.jump_distance, last.jump_distance) /
                            100,
                    ),
            ) **
                2;

        velocity_change_bonus =
            Math.max(overlap_velocity_buff, non_overlap_velocity_buff) *
            distance_ratio;
        velocity_change_bonus *=
            (Math.min(current.strain_time, last.strain_time) /
                Math.max(current.strain_time, last.strain_time)) **
            2;
    }

    if (current.travel_time !== 0) {
        slider_bonus = current.travel_distance / current.travel_time;
    }

    aim_strain += Math.max(
        acute_bonus * 2,
        wide_bonus * 1.5 + velocity_change_bonus * 0.75,
    );
    if (with_sliders) aim_strain += slider_bonus * 1.5;
    return aim_strain;
}

function calculate_aim_difficulty(
    objects: Nov2021DifficultyHitObject[],
    with_sliders: boolean,
): number {
    let current_strain = 0;
    const peaks: number[] = [];
    let section_peak = 0;
    let section_end = 0;
    const previous: Nov2021DifficultyHitObject[] = [];

    for (const current of objects) {
        if (previous.length === 0) {
            section_end =
                Math.ceil(current.start_time / SECTION_LENGTH) * SECTION_LENGTH;
        }
        while (current.start_time > section_end) {
            peaks.push(section_peak);
            const last = previous[0];
            section_peak = last
                ? current_strain *
                  strain_decay(section_end - last.start_time, 0.15)
                : current_strain;
            section_end += SECTION_LENGTH;
        }

        current_strain *= strain_decay(current.delta_time, 0.15);
        current_strain +=
            calculate_aim_strain_value(current, previous, with_sliders) * 23.25;
        section_peak = Math.max(section_peak, current_strain);

        previous.unshift(current);
        if (previous.length > 2) previous.pop();
    }

    return reduce_strain_peaks(peaks.concat(section_peak), 10, 0.75, 0.9, 1.06);
}

function calculate_rhythm_bonus(
    current: Nov2021DifficultyHitObject,
    previous: Nov2021DifficultyHitObject[],
    great_window: number,
): number {
    if (current.base_object.is_spinner) return 0;

    let previous_island_size = 0;
    let rhythm_complexity_sum = 0;
    let island_size = 1;
    let start_ratio = 0;
    let first_delta_switch = false;

    for (let i = previous.length - 2; i > 0; i--) {
        const curr = previous[i - 1]!;
        const prev = previous[i]!;
        const last = previous[i + 1]!;

        let historical_decay = Math.max(
            0,
            (5000 - (current.start_time - curr.start_time)) / 5000,
        );
        if (historical_decay === 0) continue;
        historical_decay = Math.min(
            (previous.length - i) / previous.length,
            historical_decay,
        );

        const curr_delta = curr.strain_time;
        const prev_delta = prev.strain_time;
        const last_delta = last.strain_time;
        const curr_ratio =
            1 +
            6 *
                Math.min(
                    0.5,
                    Math.sin(
                        Math.PI /
                            (Math.min(prev_delta, curr_delta) /
                                Math.max(prev_delta, curr_delta)),
                    ) ** 2,
                );
        const window_penalty = Math.min(
            1,
            Math.max(
                0,
                Math.abs(prev_delta - curr_delta) - great_window * 0.6,
            ) /
                (great_window * 0.6),
        );
        let effective_ratio = window_penalty * curr_ratio;

        if (first_delta_switch) {
            if (!(
                prev_delta > 1.25 * curr_delta || prev_delta * 1.25 < curr_delta
            )) {
                if (island_size < 7) island_size++;
            } else {
                if (curr.base_object.is_slider) effective_ratio *= 0.125;
                if (prev.base_object.is_slider) effective_ratio *= 0.25;
                if (previous_island_size === island_size)
                    effective_ratio *= 0.25;
                if (previous_island_size % 2 === island_size % 2)
                    effective_ratio *= 0.5;
                if (
                    last_delta > prev_delta + 10 &&
                    prev_delta > curr_delta + 10
                )
                    effective_ratio *= 0.125;

                rhythm_complexity_sum +=
                    Math.sqrt(effective_ratio * start_ratio) *
                    historical_decay *
                    (Math.sqrt(4 + island_size) / 2) *
                    (Math.sqrt(4 + previous_island_size) / 2);
                start_ratio = effective_ratio;
                previous_island_size = island_size;
                if (prev_delta * 1.25 < curr_delta) first_delta_switch = false;
                island_size = 1;
            }
        } else if (prev_delta > 1.25 * curr_delta) {
            first_delta_switch = true;
            start_ratio = effective_ratio;
            island_size = 1;
        }
    }

    return Math.sqrt(4 + rhythm_complexity_sum * 0.75) / 2;
}

function calculate_speed_strain_value(
    current: Nov2021DifficultyHitObject,
    previous: Nov2021DifficultyHitObject[],
    great_window: number,
): number {
    if (current.base_object.is_spinner) return 0;

    let strain_time = current.strain_time;
    const great_window_full = great_window * 2;
    const speed_window_ratio = strain_time / great_window_full;
    const last = previous[0];
    if (
        last &&
        strain_time < great_window_full &&
        last.strain_time > strain_time
    ) {
        strain_time =
            last.strain_time +
            (strain_time - last.strain_time) * speed_window_ratio;
    }

    strain_time /= clamp(strain_time / great_window_full / 0.93, 0.92, 1);

    let speed_bonus = 1;
    if (strain_time < 75) {
        speed_bonus = 1 + 0.75 * ((75 - strain_time) / 40) ** 2;
    }

    const distance_value = Math.min(
        125,
        current.travel_distance + current.jump_distance,
    );
    return (
        (speed_bonus + speed_bonus * (distance_value / 125) ** 3.5) /
        strain_time
    );
}

function calculate_speed_difficulty(
    objects: Nov2021DifficultyHitObject[],
    great_window: number,
): number {
    let current_strain = 0;
    let current_rhythm = 0;
    const peaks: number[] = [];
    let section_peak = 0;
    let section_end = 0;
    const previous: Nov2021DifficultyHitObject[] = [];

    for (const current of objects) {
        if (previous.length === 0) {
            section_end =
                Math.ceil(current.start_time / SECTION_LENGTH) * SECTION_LENGTH;
        }
        while (current.start_time > section_end) {
            peaks.push(section_peak);
            const last = previous[0];
            section_peak = last
                ? current_strain *
                  current_rhythm *
                  strain_decay(section_end - last.start_time, 0.3)
                : current_strain * current_rhythm;
            section_end += SECTION_LENGTH;
        }

        current_strain *= strain_decay(current.strain_time, 0.3);
        current_strain +=
            calculate_speed_strain_value(current, previous, great_window) *
            1375;
        current_rhythm = calculate_rhythm_bonus(
            current,
            previous,
            great_window,
        );
        section_peak = Math.max(section_peak, current_strain * current_rhythm);

        previous.unshift(current);
        if (previous.length > 32) previous.pop();
    }

    return reduce_strain_peaks(peaks.concat(section_peak), 5, 0.75, 0.9, 1.04);
}

function flashlight_opacity(
    ms: number,
    preempt: number,
    hidden: boolean,
): number {
    if (hidden) {
        return clamp(
            Math.min((1 - ms / preempt) * 2.5, (ms / preempt) * (1 / 0.3)),
            0,
            1,
        );
    }
    return clamp((1 - ms / preempt) * 1.5, 0, 1);
}

function calculate_flashlight_difficulty(
    objects: Nov2021DifficultyHitObject[],
    preempt: number,
    hidden: boolean,
): number {
    let current_strain = 0;
    const peaks: number[] = [];
    let section_peak = 0;
    let section_end = 0;
    const previous: Nov2021DifficultyHitObject[] = [];

    for (const current of objects) {
        if (previous.length === 0) {
            section_end =
                Math.ceil(current.start_time / SECTION_LENGTH) * SECTION_LENGTH;
        }
        while (current.start_time > section_end) {
            peaks.push(section_peak);
            const last = previous[0];
            section_peak = last
                ? current_strain *
                  strain_decay(section_end - last.start_time, 0.15)
                : current_strain;
            section_end += SECTION_LENGTH;
        }

        let strain_value = 0;
        if (!current.base_object.is_spinner) {
            const scaling_factor = 52 / current.radius;
            let small_distance_nerf = 1;
            let cumulative_strain_time = 0;

            for (let i = 0; i < previous.length; i++) {
                const last = previous[i]!;
                cumulative_strain_time += last.strain_time;
                if (last.base_object.is_spinner) continue;

                const jump_distance = distance(
                    {
                        x: current.base_object.stacked_x,
                        y: current.base_object.stacked_y,
                    },
                    end_position(last.base_object),
                );
                if (i === 0)
                    small_distance_nerf = Math.min(1, jump_distance / 75);
                const stack_nerf = Math.min(
                    1,
                    last.jump_distance / scaling_factor / 25,
                );
                const opacity_bonus =
                    1 +
                    0.4 *
                        (1 -
                            flashlight_opacity(
                                cumulative_strain_time,
                                preempt,
                                hidden,
                            ));
                strain_value +=
                    (0.8 ** i *
                        stack_nerf *
                        opacity_bonus *
                        scaling_factor *
                        jump_distance) /
                    cumulative_strain_time;
            }

            strain_value = (small_distance_nerf * strain_value) ** 2;
            if (hidden) strain_value *= 1.4;
        }

        current_strain *= strain_decay(current.delta_time, 0.15);
        current_strain += strain_value * 0.12;
        section_peak = Math.max(section_peak, current_strain);

        previous.unshift(current);
        if (previous.length > 10) previous.pop();
    }

    return reduce_strain_peaks(peaks.concat(section_peak), 10, 0.75, 1, 1.06);
}

function performance_from_rating(rating: number): number {
    return (5 * Math.max(1, rating / DIFFICULTY_MULTIPLIER) - 4) ** 3 / 100000;
}

export function calculate_nov2021_difficulty(
    source_beatmap: BeatmapData,
    mods: string[],
): Nov2021DifficultyAttributes {
    const modded = apply_mods(source_beatmap, mods);
    const { beatmap, clock_rate, ar, od, cs } = modded;
    const objects: Nov2021DifficultyHitObject[] = [];

    for (let i = 1; i < beatmap.hit_objects.length; i++) {
        objects.push(
            new Nov2021DifficultyHitObject(
                beatmap.hit_objects[i]!,
                beatmap.hit_objects[i - 1]!,
                i > 1 ? beatmap.hit_objects[i - 2]! : null,
                clock_rate,
                cs,
                objects.length,
            ),
        );
    }

    const hit_window_great = difficulty_range(od, 80, 50, 20) / clock_rate;
    const preempt = difficulty_range(ar, 1800, 1200, 450) / clock_rate;
    const effective_ar =
        preempt > 1200 ? (1800 - preempt) / 120 : (1200 - preempt) / 150 + 5;
    const effective_od = (80 - hit_window_great) / 6;

    const aim_value = calculate_aim_difficulty(objects, true);
    const aim_no_slider_value = calculate_aim_difficulty(objects, false);
    const speed_value = mods.includes("RX")
        ? 0
        : calculate_speed_difficulty(objects, hit_window_great);
    const flashlight_value = calculate_flashlight_difficulty(
        objects,
        preempt,
        mods.includes("HD"),
    );

    const aim_strain = Math.sqrt(aim_value) * DIFFICULTY_MULTIPLIER;
    const aim_no_slider_strain =
        Math.sqrt(aim_no_slider_value) * DIFFICULTY_MULTIPLIER;
    const speed_strain = Math.sqrt(speed_value) * DIFFICULTY_MULTIPLIER;
    const flashlight_rating =
        Math.sqrt(flashlight_value) * DIFFICULTY_MULTIPLIER;
    const slider_factor =
        aim_strain > 0 ? aim_no_slider_strain / aim_strain : 1;

    const base_aim_performance = performance_from_rating(aim_strain);
    const base_speed_performance = performance_from_rating(speed_strain);
    const base_flashlight_performance = mods.includes("FL")
        ? flashlight_rating ** 2 * 25
        : 0;
    const base_performance =
        (base_aim_performance ** 1.1 +
            base_speed_performance ** 1.1 +
            base_flashlight_performance ** 1.1) **
        (1 / 1.1);
    const star_rating =
        base_performance > 0.00001
            ? Math.cbrt(1.12) *
              0.027 *
              (Math.cbrt((100000 / 2 ** (1 / 1.1)) * base_performance) + 4)
            : 0;

    return {
        star_rating,
        max_combo: beatmap.max_combo,
        aim_strain,
        speed_strain,
        flashlight_rating,
        slider_factor,
        approach_rate: effective_ar,
        overall_difficulty: effective_od,
        circle_size: cs,
        drain_rate: modded.hp,
        hit_circle_count: beatmap.num_hit_circles,
        slider_count: beatmap.num_sliders,
        spinner_count: beatmap.num_spinners,
    };
}

export { Nov2021DifficultyHitObject };
