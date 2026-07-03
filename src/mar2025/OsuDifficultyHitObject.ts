import type { HitObject } from "../BeatmapData";
import { difficulty_range } from "../utils";

const NORMALIZED_RADIUS = 50;
const LEGACY_SCALE_FUDGE = 1.00041;
const MIN_DELTA_TIME = 25;
const MAXIMUM_SLIDER_RADIUS = NORMALIZED_RADIUS * 2.4;
const ASSUMED_SLIDER_RADIUS = NORMALIZED_RADIUS * 1.8;
const HIDDEN_FADE_OUT_DURATION_MULTIPLIER = 0.3;

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
    readonly strain_time: number;
    readonly hit_window_great: number;
    readonly radius: number;
    readonly small_circle_bonus: number;
    readonly time_preempt: number;
    readonly time_fade_in: number;

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
        all_objects: OsuDifficultyHitObject[],
        index: number,
    ) {
        this.base_object = hit_object;
        this.last_object = last_object;
        this.last_last_object = last_last_object;
        this.all_objects = all_objects;
        this.index = index;

        this.delta_time = (hit_object.time - last_object.time) / clock_rate;
        this.start_time = hit_object.time / clock_rate;
        this.end_time = this.start_time;

        this.strain_time = Math.max(MIN_DELTA_TIME, this.delta_time);
        this.hit_window_great =
            (2 * (80 - 6 * overall_difficulty)) / clock_rate;
        const obj_scale =
            ((1.0 - (0.7 * (circle_size - 5)) / 5) / 2) * LEGACY_SCALE_FUDGE;
        this.radius = 64 * obj_scale;
        this.small_circle_bonus = Math.max(1, 1 + (30 - this.radius) / 40);
        this.time_preempt = difficulty_range(approach_rate, 1800, 1200, 450);
        this.time_fade_in = 400 * Math.min(1, this.time_preempt / 450);

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

        const fade_in_start_time = this.base_object.time - this.time_preempt;
        const fade_in_duration = this.time_fade_in;

        if (hidden) {
            const fade_out_start_time =
                this.base_object.time - this.time_preempt + this.time_fade_in;
            const fade_out_duration =
                this.time_preempt * HIDDEN_FADE_OUT_DURATION_MULTIPLIER;

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
            Math.min(1, current_delta_time / this.hit_window_great) ** 2;

        return 1 - speed_ratio ** (1 - window_ratio);
    }

    private set_distances(clock_rate: number, circle_size: number): void {
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

        const obj_scale =
            ((1.0 - (0.7 * (circle_size - 5)) / 5) / 2) * LEGACY_SCALE_FUDGE;
        const radius = Math.fround(64 * obj_scale);
        let scaling_factor = Math.fround(NORMALIZED_RADIUS / radius);
        if (radius < 30) {
            const small_circle_bonus = Math.min(30 - radius, 5) / 50;
            scaling_factor = Math.fround(
                scaling_factor * (1 + small_circle_bonus),
            );
        }

        const last_cursor_pos = this.get_end_cursor_position(last_obj);

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

        if (last_obj.is_slider && last_obj.lazy_travel_time != null) {
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

    private get_end_cursor_position(obj: HitObject): { x: number; y: number } {
        if (obj.is_slider && obj.lazy_end_x != null && obj.lazy_end_y != null) {
            return {
                x: obj.lazy_end_x + (obj.stacked_x - obj.x),
                y: obj.lazy_end_y + (obj.stacked_y - obj.y),
            };
        }
        return { x: obj.stacked_x, y: obj.stacked_y };
    }

    private get_tail_position(obj: HitObject): { x: number; y: number } {
        if (obj.is_slider && obj.tail_x != null && obj.tail_y != null) {
            return {
                x: obj.tail_x + (obj.stacked_x - obj.x),
                y: obj.tail_y + (obj.stacked_y - obj.y),
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
                    (this.base_object.stacked_x - this.base_object.x),
                y:
                    (this.base_object.tail_y ??
                        this.base_object.end_y ??
                        this.base_object.y) +
                    (this.base_object.stacked_y - this.base_object.y),
            };
        }

        return { x: this.base_object.stacked_x, y: this.base_object.stacked_y };
    }
}
