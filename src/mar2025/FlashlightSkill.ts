import type { OsuRework } from "./AimSkill";
import type { OsuDifficultyHitObject } from "./OsuDifficultyHitObject";

const SKILL_MULTIPLIER = 0.05512;
const SEP2022_SKILL_MULTIPLIER = 0.052;
const STRAIN_DECAY_BASE = 0.15;
const SECTION_LENGTH = 400;
const MAX_OPACITY_BONUS = 0.4;
const HIDDEN_BONUS = 0.2;
const MIN_VELOCITY = 0.5;
const SLIDER_MULTIPLIER = 1.3;
const MIN_ANGLE_MULTIPLIER = 0.2;

function strain_decay(ms: number): number {
    return STRAIN_DECAY_BASE ** (ms / 1000);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function evaluate_flashlight_difficulty(
    current: OsuDifficultyHitObject,
    hidden: boolean,
    rework: OsuRework,
): number {
    if (current.base_object.is_spinner) return 0;

    const scaling_factor = 52 / current.radius;
    let small_dist_nerf = 1;
    let cumulative_strain_time = 0;
    let result = 0;
    let last_obj = current;
    let angle_repeat_count = 0;

    for (let i = 0; i < Math.min(current.index, 10); i++) {
        const previous = current.previous(i);
        if (!previous) break;

        if (rework !== "sep2022") {
            cumulative_strain_time += last_obj.strain_time;
        }

        if (!previous.base_object.is_spinner) {
            if (rework === "sep2022") {
                cumulative_strain_time += last_obj.strain_time;
            }
            const jump_distance = distance(
                {
                    x: current.base_object.stacked_x,
                    y: current.base_object.stacked_y,
                },
                previous.end_position,
            );

            if (i === 0) small_dist_nerf = Math.min(1, jump_distance / 75);

            const stack_nerf = Math.min(
                1,
                previous.lazy_jump_distance / scaling_factor / 25,
            );
            const opacity_bonus =
                1 +
                MAX_OPACITY_BONUS *
                    (1 - current.opacity_at(previous.base_object.time, hidden));

            result +=
                (stack_nerf * opacity_bonus * scaling_factor * jump_distance) /
                cumulative_strain_time;

            if (previous.angle != null && current.angle != null) {
                if (Math.abs(previous.angle - current.angle) < 0.02) {
                    angle_repeat_count += Math.max(1 - 0.1 * i, 0);
                }
            }
        }

        last_obj = previous;
    }

    result = (small_dist_nerf * result) ** 2;
    if (hidden) result *= 1 + HIDDEN_BONUS;
    result *=
        MIN_ANGLE_MULTIPLIER +
        (1 - MIN_ANGLE_MULTIPLIER) / (angle_repeat_count + 1);

    let slider_bonus = 0;
    if (current.base_object.is_slider) {
        const pixel_travel_distance =
            (rework === "sep2022"
                ? (current.base_object.lazy_travel_distance ?? 0)
                : current.travel_distance) / scaling_factor;
        slider_bonus =
            Math.max(
                0,
                pixel_travel_distance / current.travel_time - MIN_VELOCITY,
            ) ** 0.5;
        slider_bonus *= pixel_travel_distance;

        const repeat_count = (current.base_object.slider_span_count ?? 1) - 1;
        if (repeat_count > 0) slider_bonus /= repeat_count + 1;
    }

    result += slider_bonus * SLIDER_MULTIPLIER;

    return result;
}

export function calculate_flashlight_skill(
    objects: OsuDifficultyHitObject[],
    hidden: boolean,
    rework: OsuRework = "mar2025",
): { difficulty_value: number; flashlight_rating: number } {
    const strain_peaks: number[] = [];
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
            evaluate_flashlight_difficulty(current, hidden, rework) *
            (rework === "sep2022"
                ? SEP2022_SKILL_MULTIPLIER
                : SKILL_MULTIPLIER);
        current_section_peak = Math.max(current_strain, current_section_peak);
    }

    const difficulty_value = [...strain_peaks, current_section_peak].reduce(
        (sum, strain) => sum + strain,
        0,
    );
    const scaled_difficulty_value =
        difficulty_value * (rework === "sep2022" ? 1.06 : 1);

    return {
        difficulty_value: scaled_difficulty_value,
        flashlight_rating: Math.sqrt(scaled_difficulty_value) * 0.0675,
    };
}

export function flashlight_difficulty_to_performance(
    difficulty: number,
): number {
    return 25 * difficulty ** 2;
}
