import {
    bpm_to_milliseconds,
    clamp,
    lerp,
    logistic,
    milliseconds_to_bpm,
} from "../utils";
import type { OsuDifficultyHitObject } from "./OsuDifficultyHitObject";

const SINGLE_SPACING_THRESHOLD = 125;
const MIN_SPEED_BONUS = 200;
const SPEED_BALANCING_FACTOR = 40;
const HISTORY_TIME_MAX = 5000;
const HISTORY_OBJECTS_MAX = 32;
const RHYTHM_OVERALL_MULTIPLIER = 0.95;
const RHYTHM_RATIO_MULTIPLIER = 12;
const DISTANCE_MULTIPLIER = 0.9;
const SKILL_MULTIPLIER = 1.46;
const STRAIN_DECAY_BASE = 0.3;

function strain_decay(ms: number): number {
    return STRAIN_DECAY_BASE ** (ms / 1000);
}

function evaluate_speed_difficulty(
    current: OsuDifficultyHitObject,
    mods: string[],
): number {
    if (current.base_object.is_spinner) return 0;

    const previous = current.index > 0 ? current.previous(0) : undefined;
    let strain_time = current.strain_time;
    const doubletapness = 1 - current.get_doubletapness(current.next(0));

    strain_time /= clamp(
        strain_time / current.hit_window_great / 0.93,
        0.92,
        1,
    );

    let speed_bonus = 0;
    if (milliseconds_to_bpm(strain_time) > MIN_SPEED_BONUS) {
        speed_bonus =
            0.75 *
            ((bpm_to_milliseconds(MIN_SPEED_BONUS) - strain_time) /
                SPEED_BALANCING_FACTOR) **
                2;
    }

    const travel_distance = previous?.travel_distance ?? 0;
    const distance = Math.min(
        travel_distance + current.minimum_jump_distance,
        SINGLE_SPACING_THRESHOLD,
    );
    let distance_bonus =
        (distance / SINGLE_SPACING_THRESHOLD) ** 3.95 * DISTANCE_MULTIPLIER;

    if (mods.includes("AP")) distance_bonus = 0;

    return (
        ((1 + speed_bonus + distance_bonus) * 1000 * doubletapness) /
        strain_time
    );
}

class Island {
    delta = Number.MAX_SAFE_INTEGER;
    delta_count = 0;

    constructor(
        private readonly epsilon: number,
        delta?: number,
    ) {
        if (delta != null) this.add_delta(delta);
    }

    add_delta(delta: number): void {
        if (this.delta === Number.MAX_SAFE_INTEGER) {
            this.delta = Math.max(delta, 25);
        }
        this.delta_count++;
    }

    is_similar_polarity(other: Island): boolean {
        return this.delta_count % 2 === other.delta_count % 2;
    }

    equals(other: Island): boolean {
        return (
            Math.abs(this.delta - other.delta) < this.epsilon &&
            this.delta_count === other.delta_count
        );
    }
}

function evaluate_rhythm_difficulty(current: OsuDifficultyHitObject): number {
    if (current.base_object.is_spinner) return 0;

    let rhythm_complexity_sum = 0;
    const delta_difference_epsilon = current.hit_window_great * 0.3;

    let island = new Island(delta_difference_epsilon);
    let previous_island = new Island(delta_difference_epsilon);
    const island_counts: { island: Island; count: number }[] = [];

    let start_ratio = 0;
    let first_delta_switch = false;
    const historical_note_count = Math.min(current.index, HISTORY_OBJECTS_MAX);

    let rhythm_start = 0;
    while (
        rhythm_start < historical_note_count - 2 &&
        current.start_time - current.previous(rhythm_start)!.start_time <
            HISTORY_TIME_MAX
    ) {
        rhythm_start++;
    }

    const start_previous = current.previous(rhythm_start);
    const start_last = current.previous(rhythm_start + 1);
    if (!start_previous || !start_last) return 1;

    let prev_obj = start_previous;
    let last_obj = start_last;

    for (let i = rhythm_start; i > 0; i--) {
        const curr_obj = current.previous(i - 1)!;

        const time_decay =
            (HISTORY_TIME_MAX - (current.start_time - curr_obj.start_time)) /
            HISTORY_TIME_MAX;
        const note_decay = (historical_note_count - i) / historical_note_count;
        const curr_historical_decay = Math.min(note_decay, time_decay);

        const curr_delta = curr_obj.strain_time;
        const prev_delta = prev_obj.strain_time;
        const last_delta = last_obj.strain_time;

        const delta_difference_ratio =
            Math.min(prev_delta, curr_delta) / Math.max(prev_delta, curr_delta);
        const curr_ratio =
            1 +
            RHYTHM_RATIO_MULTIPLIER *
                Math.min(0.5, Math.sin(Math.PI / delta_difference_ratio) ** 2);

        const fraction = Math.max(
            prev_delta / curr_delta,
            curr_delta / prev_delta,
        );
        const fraction_multiplier = clamp(2 - fraction / 8, 0, 1);
        const window_penalty = Math.min(
            1,
            Math.max(
                0,
                Math.abs(prev_delta - curr_delta) - delta_difference_epsilon,
            ) / delta_difference_epsilon,
        );

        let effective_ratio = window_penalty * curr_ratio * fraction_multiplier;

        if (first_delta_switch) {
            if (Math.abs(prev_delta - curr_delta) < delta_difference_epsilon) {
                island.add_delta(Math.trunc(curr_delta));
            } else {
                if (curr_obj.base_object.is_slider) effective_ratio *= 0.125;
                if (prev_obj.base_object.is_slider) effective_ratio *= 0.3;
                if (island.is_similar_polarity(previous_island))
                    effective_ratio *= 0.5;
                if (
                    last_delta > prev_delta + delta_difference_epsilon &&
                    prev_delta > curr_delta + delta_difference_epsilon
                ) {
                    effective_ratio *= 0.125;
                }
                if (previous_island.delta_count === island.delta_count) {
                    effective_ratio *= 0.5;
                }

                const island_count_index = island_counts.findIndex((entry) =>
                    entry.island.equals(island),
                );

                if (island_count_index !== -1) {
                    const island_count = island_counts[island_count_index]!;
                    if (previous_island.equals(island)) island_count.count++;

                    const power = logistic(island.delta, 58.33, 0.24, 2.75);
                    effective_ratio *= Math.min(
                        3 / island_count.count,
                        (1 / island_count.count) ** power,
                    );

                    island_counts[island_count_index] = island_count;
                } else {
                    island_counts.push({ island, count: 1 });
                }

                const doubletapness = prev_obj.get_doubletapness(curr_obj);
                effective_ratio *= 1 - doubletapness * 0.75;

                rhythm_complexity_sum +=
                    Math.sqrt(effective_ratio * start_ratio) *
                    curr_historical_decay;
                start_ratio = effective_ratio;
                previous_island = island;

                if (prev_delta + delta_difference_epsilon < curr_delta) {
                    first_delta_switch = false;
                }

                island = new Island(
                    delta_difference_epsilon,
                    Math.trunc(curr_delta),
                );
            }
        } else if (prev_delta > curr_delta + delta_difference_epsilon) {
            first_delta_switch = true;
            if (curr_obj.base_object.is_slider) effective_ratio *= 0.6;
            if (prev_obj.base_object.is_slider) effective_ratio *= 0.6;
            start_ratio = effective_ratio;
            island = new Island(
                delta_difference_epsilon,
                Math.trunc(curr_delta),
            );
        }

        last_obj = prev_obj;
        prev_obj = curr_obj;
    }

    return Math.sqrt(4 + rhythm_complexity_sum * RHYTHM_OVERALL_MULTIPLIER) / 2;
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

export function calculate_speed_skill(
    objects: OsuDifficultyHitObject[],
    mods: string[],
): {
    difficulty_value: number;
    speed_difficult_strain_count: number;
    speed_note_count: number;
    slider_strains: number[];
} {
    const SECTION_LENGTH = 400;
    const DECAY_WEIGHT = 0.9;
    const REDUCED_SECTION_COUNT = 5;
    const REDUCED_STRAIN_BASELINE = 0.75;

    const strain_peaks: number[] = [];
    const object_strains: number[] = [];
    const slider_strains: number[] = [];

    let current_strain = 0;
    let current_rhythm = 0;
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
                  current_rhythm *
                  strain_decay(current_section_end - previous.start_time)
                : current_strain * current_rhythm;
            current_section_end += SECTION_LENGTH;
        }

        current_strain *= strain_decay(current.strain_time);
        current_strain +=
            evaluate_speed_difficulty(current, mods) * SKILL_MULTIPLIER;
        current_rhythm = evaluate_rhythm_difficulty(current);

        const total_strain = current_strain * current_rhythm;
        if (current.base_object.is_slider) slider_strains.push(total_strain);

        current_section_peak = Math.max(total_strain, current_section_peak);
        object_strains.push(total_strain);
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
    const speed_difficult_strain_count =
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

    const max_strain = object_strains.length ? Math.max(...object_strains) : 0;
    const speed_note_count =
        max_strain > 0
            ? object_strains.reduce(
                  (sum, strain) =>
                      sum +
                      1 / (1 + Math.exp(-((strain / max_strain) * 12 - 6))),
                  0,
              )
            : 0;

    return {
        difficulty_value,
        speed_difficult_strain_count,
        speed_note_count,
        slider_strains,
    };
}
