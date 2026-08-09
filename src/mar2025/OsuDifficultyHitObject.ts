import type { HitObject } from "../BeatmapData";
import { osu_circle_scale } from "../BeatmapData";
import { difficulty_range, osu_hit_window, reverse_lerp } from "../utils";
import type { OsuRework } from "./AimSkill";

const NORMALIZED_RADIUS = 50;
const LEGACY_SCALE_FUDGE = 1.00041;
const MIN_DELTA_TIME = 25;
const MAXIMUM_SLIDER_RADIUS = NORMALIZED_RADIUS * 2.4;
const ASSUMED_SLIDER_RADIUS = NORMALIZED_RADIUS * 1.8;
const HIDDEN_FADE_IN_DURATION_MULTIPLIER = 0.4;
const HIDDEN_FADE_OUT_DURATION_MULTIPLIER = 0.3;

function circle_scale_for_rework(
    circle_size: number,
    rework: OsuRework,
): number {
    if (rework === "feb2019") {
        const f = Math.fround;
        const cs = f(circle_size);
        const term = f(f(0.7) * f(cs - f(5)));
        return f(f(f(1) - f(term / f(5))) / f(2));
    }

    if (rework === "jul2021") {
        const f = Math.fround;
        const cs = f(circle_size);
        const term = f(f(0.7) * f(cs - f(5)));
        const scale = f(f(f(1) - f(term / f(5))) / f(2));
        return f(scale * f(1.00041));
    }

    return rework === "jul2026"
        ? osu_circle_scale(circle_size)
        : Math.fround(
              ((1.0 - (0.7 * (circle_size - 5)) / 5) / 2) *
                  (rework === "sep2022" ? 1 : 1.00041),
          );
}

export class OsuDifficultyHitObject {
    readonly base_object: HitObject;
    readonly last_object: HitObject;
    readonly last_last_object: HitObject | null;

    jump_distance: number = 0;
    lazy_jump_distance: number = 0;
    minimum_jump_distance: number = 0;
    minimum_jump_time: number = 0;
    travel_distance: number = 0;
    travel_time: number = 0;
    angle: number | null = null;
    normalised_vector_angle: number | null = null;
    last_object_end_delta_time: number;
    readonly strain_time: number;
    readonly adjusted_delta_time: number;
    readonly hit_window_great: number;
    readonly overall_difficulty: number;
    readonly radius: number;
    readonly small_circle_bonus: number;
    readonly raw_time_preempt: number;
    readonly time_preempt: number;
    readonly time_fade_in: number;
    private readonly hidden: boolean;

    readonly delta_time: number;
    readonly start_time: number;
    readonly end_time: number;
    readonly index: number;

    private readonly all_objects: OsuDifficultyHitObject[];

    constructor(
        hit_object: HitObject,
        last_object: HitObject,
        last_last_object: HitObject | null,
        clock_rate: number,
        circle_size: number,
        overall_difficulty: number,
        approach_rate: number,
        private readonly rework: OsuRework,
        hidden: boolean,
        all_objects: OsuDifficultyHitObject[],
        index: number,
    ) {
        this.base_object = hit_object;
        this.last_object = last_object;
        this.last_last_object = last_last_object;
        this.hidden = hidden;
        this.all_objects = all_objects;
        this.index = index;

        this.delta_time = (hit_object.time - last_object.time) / clock_rate;
        this.start_time = hit_object.time / clock_rate;
        this.end_time =
            this.rework === "jul2026"
                ? hit_object.end_time / clock_rate
                : this.start_time;

        this.strain_time = Math.max(
            this.rework === "feb2019" || this.rework === "jul2021"
                ? 50
                : MIN_DELTA_TIME,
            this.delta_time,
        );
        this.adjusted_delta_time = this.strain_time;
        this.last_object_end_delta_time =
            this.rework === "jul2026" && this.previous(0)
                ? Math.max(
                      this.start_time - this.previous(0)!.end_time,
                      MIN_DELTA_TIME,
                  )
                : this.strain_time;
        const raw_time_preempt =
            this.rework === "jul2026"
                ? Math.trunc(difficulty_range(approach_rate, 1800, 1200, 450))
                : difficulty_range(approach_rate, 1800, 1200, 450);
        this.hit_window_great =
            (2 *
                (this.rework === "oct2025" || this.rework === "jul2026"
                    ? osu_hit_window(overall_difficulty, 80, 50, 20)
                    : 80 - 6 * overall_difficulty)) /
            clock_rate;
        this.overall_difficulty = (79.5 - this.hit_window_great / 2) / 6;
        const obj_scale = circle_scale_for_rework(circle_size, this.rework);
        this.radius = Math.fround(64 * obj_scale);
        this.small_circle_bonus = Math.max(
            1,
            1 + (30 - this.radius) / (this.rework === "jul2026" ? 70 : 40),
        );
        this.raw_time_preempt = raw_time_preempt;
        this.time_preempt =
            raw_time_preempt / (this.rework === "jul2026" ? clock_rate : 1);
        this.time_fade_in = 400 * Math.min(1, raw_time_preempt / 450);

        this.set_distances(clock_rate, circle_size);
    }

    previous(backwards_index: number): OsuDifficultyHitObject | undefined {
        const index = this.index - (backwards_index + 1);
        return index >= 0 && index < this.all_objects.length
            ? this.all_objects[index]
            : undefined;
    }

    next(forwards_index: number): OsuDifficultyHitObject | undefined {
        const index = this.index + forwards_index + 1;
        return index >= 0 && index < this.all_objects.length
            ? this.all_objects[index]
            : undefined;
    }

    opacity_at(time: number, hidden: boolean): number {
        if (time > this.base_object.time) return 0;

        const fade_in_start_time =
            this.base_object.time - this.raw_time_preempt;
        const fade_in_duration = this.time_fade_in;

        if (hidden) {
            const hidden_fade_in = this.hidden
                ? this.raw_time_preempt * HIDDEN_FADE_IN_DURATION_MULTIPLIER
                : this.time_fade_in;
            const fade_out_start_time =
                this.base_object.time - this.raw_time_preempt + hidden_fade_in;
            const fade_out_duration =
                this.raw_time_preempt * HIDDEN_FADE_OUT_DURATION_MULTIPLIER;

            return Math.min(
                Math.max(
                    0,
                    Math.min(1, (time - fade_in_start_time) / fade_in_duration),
                ),
                1 -
                    Math.max(
                        0,
                        Math.min(
                            1,
                            (time - fade_out_start_time) / fade_out_duration,
                        ),
                    ),
            );
        }

        return Math.max(
            0,
            Math.min(1, (time - fade_in_start_time) / fade_in_duration),
        );
    }

    get_doubletapness(next_object: OsuDifficultyHitObject | undefined): number {
        if (!next_object) return 0;

        const current_delta_time = Math.max(1, this.delta_time);
        const next_delta_time = Math.max(1, next_object.delta_time);
        const delta_difference = Math.abs(next_delta_time - current_delta_time);
        const speed_ratio =
            current_delta_time / Math.max(current_delta_time, delta_difference);
        const window_ratio =
            Math.min(1, current_delta_time / this.hit_window_great) **
            (this.rework === "jul2026" ? 5 : 2);

        if (this.rework !== "jul2026") {
            return 1 - speed_ratio ** (1 - window_ratio);
        }

        const distance_factor =
            reverse_lerp(
                this.lazy_jump_distance,
                NORMALIZED_RADIUS * 2,
                NORMALIZED_RADIUS,
            ) ** 2;
        return 1 - speed_ratio ** (distance_factor * (1 - window_ratio));
    }

    private set_distances(clock_rate: number, circle_size: number): void {
        if (this.rework === "feb2019" || this.rework === "jul2021") {
            this.set_feb2019_distances();
            return;
        }

        if (this.rework !== "jul2026") {
            this.set_legacy_distances(clock_rate, circle_size);
            return;
        }
        const base_obj = this.base_object;
        const last_obj = this.last_object;

        if (base_obj.is_slider && base_obj.lazy_travel_distance != null) {
            const repeat_count = Math.max(
                0,
                (base_obj.slider_span_count ?? 1) - 1,
            );
            this.travel_distance =
                base_obj.lazy_travel_distance *
                (this.rework === "jul2026"
                    ? Math.max(1, repeat_count ** 0.3)
                    : 1);
            this.travel_time = Math.max(
                (base_obj.lazy_travel_time ?? base_obj.slider_duration ?? 0) /
                    clock_rate,
                MIN_DELTA_TIME,
            );
        }

        if (base_obj.is_spinner || last_obj.is_spinner) return;

        const obj_scale = circle_scale_for_rework(circle_size, this.rework);
        const radius = Math.fround(64 * obj_scale);
        let scaling_factor = Math.fround(NORMALIZED_RADIUS / radius);
        if (this.rework !== "jul2026" && radius < 30) {
            const small_circle_bonus = Math.min(30 - radius, 5) / 50;
            scaling_factor = Math.fround(
                scaling_factor * (1 + small_circle_bonus),
            );
        }

        const has_last_difficulty_object = this.index > 0;
        const last_cursor_pos = has_last_difficulty_object
            ? this.get_end_cursor_position(last_obj)
            : { x: last_obj.stacked_x, y: last_obj.stacked_y };

        const distance_between = (
            first: { x: number; y: number },
            second: { x: number; y: number },
        ) => {
            const dx = Math.fround(first.x - second.x);
            const dy = Math.fround(first.y - second.y);
            return Math.fround(
                Math.sqrt(
                    Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy)),
                ),
            );
        };

        this.lazy_jump_distance = Math.fround(
            distance_between(
                { x: base_obj.stacked_x, y: base_obj.stacked_y },
                last_cursor_pos,
            ) * scaling_factor,
        );
        this.jump_distance = Math.fround(
            distance_between(
                { x: base_obj.stacked_x, y: base_obj.stacked_y },
                { x: last_obj.stacked_x, y: last_obj.stacked_y },
            ) * scaling_factor,
        );
        this.minimum_jump_distance = this.lazy_jump_distance;
        this.minimum_jump_time = this.strain_time;

        if (
            has_last_difficulty_object &&
            last_obj.is_slider &&
            last_obj.lazy_travel_time != null
        ) {
            const last_travel_time = Math.max(
                last_obj.lazy_travel_time / clock_rate,
                MIN_DELTA_TIME,
            );
            this.minimum_jump_time = Math.max(
                this.strain_time - last_travel_time,
                MIN_DELTA_TIME,
            );

            const tail_position = this.get_tail_position(last_obj);
            const tail_jump_distance = Math.fround(
                distance_between(tail_position, {
                    x: base_obj.stacked_x,
                    y: base_obj.stacked_y,
                }) * scaling_factor,
            );

            this.minimum_jump_distance = Math.max(
                0,
                Math.min(
                    this.lazy_jump_distance -
                        (MAXIMUM_SLIDER_RADIUS - ASSUMED_SLIDER_RADIUS),
                    tail_jump_distance - MAXIMUM_SLIDER_RADIUS,
                ),
            );
        }

        if (this.last_last_object && !this.last_last_object.is_spinner) {
            const last_last_pos = this.get_end_cursor_position(
                this.last_last_object,
            );
            let angle_last_cursor_pos = last_cursor_pos;
            let angle_last_last_pos = last_last_pos;
            let angle = this.calculate_angle(
                { x: base_obj.stacked_x, y: base_obj.stacked_y },
                angle_last_cursor_pos,
                angle_last_last_pos,
            );
            let slider_angle = angle;

            if (
                last_obj.is_slider &&
                (last_obj.lazy_travel_distance ?? 0) > 0
            ) {
                angle_last_cursor_pos = {
                    x: last_obj.stacked_x,
                    y: last_obj.stacked_y,
                };
                angle = this.calculate_angle(
                    { x: base_obj.stacked_x, y: base_obj.stacked_y },
                    angle_last_cursor_pos,
                    last_last_pos,
                );
                slider_angle = this.calculate_angle(
                    { x: base_obj.stacked_x, y: base_obj.stacked_y },
                    last_cursor_pos,
                    this.get_second_last_slider_position(
                        last_obj,
                        last_last_pos,
                    ),
                );
            }

            const v2x = base_obj.stacked_x - angle_last_cursor_pos.x;
            const v2y = base_obj.stacked_y - angle_last_cursor_pos.y;
            this.normalised_vector_angle = Math.atan2(
                Math.abs(v2y),
                Math.abs(v2x),
            );
            this.angle = Math.min(angle, slider_angle);
        }
    }

    private set_feb2019_distances(): void {
        const base_obj = this.base_object;
        const last_obj = this.last_object;
        let scaling_factor = Math.fround(52 / this.radius);
        if (this.radius < 30) {
            const small_circle_bonus = Math.fround(
                Math.min(30 - this.radius, 5) / 50,
            );
            scaling_factor = Math.fround(
                scaling_factor * Math.fround(1 + small_circle_bonus),
            );
        }

        if (last_obj.is_slider && last_obj.lazy_travel_distance != null) {
            this.travel_distance = Math.fround(
                last_obj.lazy_travel_distance * scaling_factor,
            );
        }

        const last_cursor_pos = this.get_end_cursor_position(last_obj);
        if (!base_obj.is_spinner) {
            const dx = Math.fround(
                Math.fround(base_obj.stacked_x * scaling_factor) -
                    Math.fround(last_cursor_pos.x * scaling_factor),
            );
            const dy = Math.fround(
                Math.fround(base_obj.stacked_y * scaling_factor) -
                    Math.fround(last_cursor_pos.y * scaling_factor),
            );
            this.jump_distance = Math.fround(
                Math.sqrt(
                    Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy)),
                ),
            );
        }

        if (this.last_last_object) {
            const last_last_cursor_pos = this.get_end_cursor_position(
                this.last_last_object,
            );
            const v1x = Math.fround(
                last_last_cursor_pos.x - last_obj.stacked_x,
            );
            const v1y = Math.fround(
                last_last_cursor_pos.y - last_obj.stacked_y,
            );
            const v2x = Math.fround(base_obj.stacked_x - last_cursor_pos.x);
            const v2y = Math.fround(base_obj.stacked_y - last_cursor_pos.y);
            const dot = Math.fround(
                Math.fround(v1x * v2x) + Math.fround(v1y * v2y),
            );
            const det = Math.fround(
                Math.fround(v1x * v2y) - Math.fround(v1y * v2x),
            );
            this.angle = Math.abs(Math.atan2(det, dot));
        }
    }

    private set_legacy_distances(
        clock_rate: number,
        circle_size: number,
    ): void {
        const base_obj = this.base_object;
        const last_obj = this.last_object;

        if (base_obj.is_slider && base_obj.lazy_travel_distance != null) {
            this.travel_distance = base_obj.lazy_travel_distance;
            this.travel_time = Math.max(
                (base_obj.lazy_travel_time ?? base_obj.slider_duration ?? 0) /
                    clock_rate,
                MIN_DELTA_TIME,
            );
        }

        if (base_obj.is_spinner || last_obj.is_spinner) return;

        const obj_scale = circle_scale_for_rework(circle_size, this.rework);
        const radius = Math.fround(64 * obj_scale);
        const normalized_radius =
            this.rework === "feb2019" || this.rework === "jul2021"
                ? 52
                : NORMALIZED_RADIUS;
        let scaling_factor = Math.fround(normalized_radius / radius);
        if (this.rework !== "oct2025" && radius < 30) {
            const small_circle_bonus = Math.min(30 - radius, 5) / 50;
            scaling_factor = Math.fround(
                scaling_factor * (1 + small_circle_bonus),
            );
        }

        const has_last_difficulty_object =
            this.rework === "oct2025" || this.rework === "jul2026"
                ? this.index > 0
                : true;
        const last_cursor_pos = has_last_difficulty_object
            ? this.get_end_cursor_position(last_obj)
            : { x: last_obj.stacked_x, y: last_obj.stacked_y };

        const start_x = Math.fround(base_obj.stacked_x * scaling_factor);
        const start_y = Math.fround(base_obj.stacked_y * scaling_factor);
        const end_x = Math.fround(last_cursor_pos.x * scaling_factor);
        const end_y = Math.fround(last_cursor_pos.y * scaling_factor);
        const dx = Math.fround(start_x - end_x);
        const dy = Math.fround(start_y - end_y);
        this.lazy_jump_distance = Math.fround(
            Math.sqrt(Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy))),
        );
        this.jump_distance = this.lazy_jump_distance;
        this.minimum_jump_distance = this.lazy_jump_distance;
        this.minimum_jump_time = this.strain_time;

        if (
            has_last_difficulty_object &&
            last_obj.is_slider &&
            last_obj.lazy_travel_time != null
        ) {
            const last_travel_time = Math.max(
                last_obj.lazy_travel_time / clock_rate,
                MIN_DELTA_TIME,
            );
            this.minimum_jump_time = Math.max(
                this.strain_time - last_travel_time,
                MIN_DELTA_TIME,
            );

            const tail_position = this.get_tail_position(last_obj);
            const tail_dx = Math.fround(
                Math.fround(tail_position.x * scaling_factor) - start_x,
            );
            const tail_dy = Math.fround(
                Math.fround(tail_position.y * scaling_factor) - start_y,
            );
            const tail_jump_distance = Math.fround(
                Math.sqrt(
                    Math.fround(
                        Math.fround(tail_dx * tail_dx) +
                            Math.fround(tail_dy * tail_dy),
                    ),
                ),
            );

            this.minimum_jump_distance = Math.max(
                0,
                Math.min(
                    this.lazy_jump_distance -
                        (MAXIMUM_SLIDER_RADIUS - ASSUMED_SLIDER_RADIUS),
                    tail_jump_distance - MAXIMUM_SLIDER_RADIUS,
                ),
            );
        }

        if (this.last_last_object && !this.last_last_object.is_spinner) {
            const last_last_pos = this.get_end_cursor_position(
                this.last_last_object,
            );

            const v1x = last_last_pos.x - last_obj.stacked_x;
            const v1y = last_last_pos.y - last_obj.stacked_y;
            const v2x = base_obj.stacked_x - last_cursor_pos.x;
            const v2y = base_obj.stacked_y - last_cursor_pos.y;

            const dot = Math.fround(
                Math.fround(v1x * v2x) + Math.fround(v1y * v2y),
            );
            const det = Math.fround(
                Math.fround(v1x * v2y) - Math.fround(v1y * v2x),
            );
            this.angle = Math.abs(Math.atan2(det, dot));
        }
    }
    private calculate_angle(
        current: { x: number; y: number },
        last: { x: number; y: number },
        last_last: { x: number; y: number },
    ): number {
        const v1x = last_last.x - last.x;
        const v1y = last_last.y - last.y;
        const v2x = current.x - last.x;
        const v2y = current.y - last.y;
        const dot = Math.fround(
            Math.fround(v1x * v2x) + Math.fround(v1y * v2y),
        );
        const det = Math.fround(
            Math.fround(v1x * v2y) - Math.fround(v1y * v2x),
        );
        return Math.abs(Math.atan2(det, dot));
    }
    private get_second_last_slider_position(
        slider: HitObject,
        fallback: { x: number; y: number },
    ): { x: number; y: number } {
        if (this.rework === "jul2026") {
            const second_last_event =
                slider.slider_nested_events?.[
                    (slider.slider_nested_events?.length ?? 0) - 2
                ];
            if (second_last_event && slider.slider_path) {
                const point = this.point_at_slider_path(
                    slider.slider_path,
                    second_last_event.path_progress *
                        (slider.slider_pixel_length ?? 0),
                );
                return {
                    x: slider.stacked_x + point.x,
                    y: slider.stacked_y + point.y,
                };
            }
        }

        if (
            !slider.slider_path ||
            slider.slider_pixel_length == null ||
            slider.slider_duration == null ||
            !slider.slider_nested_times ||
            slider.slider_nested_times.length < 2
        )
            return fallback;

        const second_last_time =
            slider.slider_nested_times[slider.slider_nested_times.length - 2]!;
        const span_count = slider.slider_span_count ?? 1;
        const progress =
            ((second_last_time - slider.time) / slider.slider_duration) *
            span_count;
        const span_progress = progress % 1;
        const span = Math.floor(progress);
        const path_progress =
            span % 2 === 1 ? 1 - span_progress : span_progress;
        const point = this.point_at_slider_path(
            slider.slider_path,
            path_progress * slider.slider_pixel_length,
        );

        return {
            x: slider.stacked_x + point.x,
            y: slider.stacked_y + point.y,
        };
    }
    private point_at_slider_path(
        points: { x: number; y: number }[],
        target_distance: number,
    ): { x: number; y: number } {
        if (points.length === 0) return { x: 0, y: 0 };

        let remaining = Math.max(0, target_distance);
        for (let i = 1; i < points.length; i++) {
            const start = points[i - 1]!;
            const end = points[i]!;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const segment_length = Math.sqrt(dx * dx + dy * dy);

            if (segment_length <= 0) continue;
            if (remaining <= segment_length) {
                const progress = remaining / segment_length;
                return {
                    x: start.x + dx * progress,
                    y: start.y + dy * progress,
                };
            }
            remaining -= segment_length;
        }

        return points[points.length - 1]!;
    }

    private get_end_cursor_position(obj: HitObject): { x: number; y: number } {
        if (obj.is_slider && obj.lazy_end_x != null && obj.lazy_end_y != null) {
            if (this.rework === "feb2019" || this.rework === "jul2021") {
                return { x: obj.lazy_end_x, y: obj.lazy_end_y };
            }

            const stack_offset_x =
                this.rework === "jul2026" ? 0 : obj.stacked_x - obj.x;
            const stack_offset_y =
                this.rework === "jul2026" ? 0 : obj.stacked_y - obj.y;
            return {
                x: obj.lazy_end_x + stack_offset_x,
                y: obj.lazy_end_y + stack_offset_y,
            };
        }
        return { x: obj.stacked_x, y: obj.stacked_y };
    }

    private get_tail_position(obj: HitObject): { x: number; y: number } {
        if (obj.is_slider && obj.tail_x != null && obj.tail_y != null) {
            const stack_offset_x =
                this.rework === "jul2026" ? 0 : obj.stacked_x - obj.x;
            const stack_offset_y =
                this.rework === "jul2026" ? 0 : obj.stacked_y - obj.y;
            return {
                x: obj.tail_x + stack_offset_x,
                y: obj.tail_y + stack_offset_y,
            };
        }

        return { x: obj.stacked_x, y: obj.stacked_y };
    }

    get end_position(): { x: number; y: number } {
        if (this.base_object.is_slider) {
            return {
                x:
                    (this.base_object.tail_x ??
                        this.base_object.end_x ??
                        this.base_object.x) +
                    (this.rework === "jul2026"
                        ? this.base_object.stacked_x - this.base_object.x
                        : this.base_object.stacked_x - this.base_object.x),
                y:
                    (this.base_object.tail_y ??
                        this.base_object.end_y ??
                        this.base_object.y) +
                    (this.rework === "jul2026"
                        ? this.base_object.stacked_y - this.base_object.y
                        : this.base_object.stacked_y - this.base_object.y),
            };
        }

        return { x: this.base_object.stacked_x, y: this.base_object.stacked_y };
    }
}
