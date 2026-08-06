import type { scores_list_user_beatmap_all_response } from "osu-api-extended/dist/types/v2/scores_list_user_beatmap_all";

export interface SliderPathPoint {
    x: number;
    y: number;
    path_distance?: number;
}

export type SliderNestedEventType = "head" | "tick" | "repeat" | "tail";

export interface SliderNestedEvent {
    time: number;
    path_progress: number;
    type: SliderNestedEventType;
}

export interface HitObject {
    x: number;
    y: number;
    time: number;
    is_spinner: boolean;
    is_slider: boolean;
    lazy_end_x?: number;
    lazy_end_y?: number;
    lazy_travel_distance?: number;
    lazy_travel_time?: number;
    end_time: number;
    slider_path?: SliderPathPoint[];
    slider_span_count?: number;
    slider_pixel_length?: number;
    slider_duration?: number;
    slider_nested_times?: number[];
    slider_nested_events?: SliderNestedEvent[];
    stack_height: number;
    stacked_x: number;
    stacked_y: number;
    end_x?: number;
    end_y?: number;
    tail_x?: number;
    tail_y?: number;
}

export function osu_circle_scale(circle_size: number): number {
    const f = Math.fround;
    const cs = f(circle_size);
    const term = f(f(0.7) * f(cs - f(5)));
    const normalised = f(f(1) - f(term / f(5)));
    const half = f(normalised / f(2));
    return f(half * f(1.00041));
}
export interface BreakPeriod {
    start_time: number;
    end_time: number;
}

export interface BeatmapData {
    od: number;
    ar: number;
    cs: number;
    hp: number;
    format_version: number;
    stack_leniency: number;
    num_hit_circles: number;
    num_sliders: number;
    num_spinners: number;
    max_combo: number;
    breaks: BreakPeriod[];
    hit_objects: HitObject[];
}

export type ScoreData = scores_list_user_beatmap_all_response;

/**
 * Finds the point along a slider path at a given distance from the start of the path.
 * @param points The points along the slider path, with optional path_distance values.
 * @param target_distance The distance from the start of the path.
 * @returns The point at the specified distance along the path.
 */
export function point_at_slider_path(
    points: readonly SliderPathPoint[],
    target_distance: number,
): { x: number; y: number } {
    if (points.length === 0) return { x: 0, y: 0 };

    const target = Math.max(0, target_distance);
    const total_distance = points[points.length - 1]?.path_distance;

    if (total_distance != null) {
        if (target <= 0) return points[0]!;
        if (target >= total_distance) return points[points.length - 1]!;

        let low = 1;
        let high = points.length - 1;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if ((points[mid]!.path_distance ?? 0) < target) low = mid + 1;
            else high = mid;
        }

        const end = points[low]!;
        const start = points[low - 1]!;
        const start_distance = start.path_distance ?? 0;
        const end_distance = end.path_distance ?? start_distance;
        const segment_length = end_distance - start_distance;
        if (segment_length <= 0) return end;

        const progress = (target - start_distance) / segment_length;
        return {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
        };
    }

    let remaining = target;
    for (let i = 1; i < points.length; i++) {
        const start = points[i - 1]!;
        const end = points[i]!;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const segment_length = Math.sqrt(dx * dx + dy * dy);

        if (segment_length === 0) continue;
        if (remaining <= segment_length) {
            const progress = remaining / segment_length;
            return { x: start.x + dx * progress, y: start.y + dy * progress };
        }

        remaining -= segment_length;
    }

    return points[points.length - 1]!;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function end_position(hit_object: HitObject) {
    return {
        x: hit_object.end_x ?? hit_object.x,
        y: hit_object.end_y ?? hit_object.y,
    };
}

function path_end_position(hit_object: HitObject) {
    if (
        hit_object.is_slider &&
        hit_object.slider_path &&
        hit_object.slider_pixel_length != null
    ) {
        const end = point_at_slider_path(
            hit_object.slider_path,
            hit_object.slider_pixel_length,
        );
        return {
            x: hit_object.x + end.x,
            y: hit_object.y + end.y,
        };
    }

    return end_position(hit_object);
}

export function apply_osu_stacking(
    hit_objects: HitObject[],
    approach_rate: number,
    stack_leniency: number,
    format_version: number,
    jul2026 = false,
): void {
    const STACK_DISTANCE = 3;
    const time_preempt =
        approach_rate > 5
            ? 1200 + ((450 - 1200) * (approach_rate - 5)) / 5
            : approach_rate < 5
              ? 1200 - ((1200 - 1800) * (5 - approach_rate)) / 5
              : 1200;
    const stack_threshold =
        (jul2026 ? Math.trunc(time_preempt) : time_preempt) * stack_leniency;

    for (const hit_object of hit_objects) hit_object.stack_height = 0;

    /**
     * Parses the content of an osu! beatmap file and extracts relevant beatmap data.
     * @param content The content of the osu! beatmap file as a string.
     */

    if (format_version < 6) {
        for (let i = 0; i < hit_objects.length; i++) {
            const current = hit_objects[i]!;

            if (current.stack_height !== 0 && !current.is_slider) continue;

            let start_time = current.end_time;
            let slider_stack = 0;

            for (let j = i + 1; j < hit_objects.length; j++) {
                if (hit_objects[j]!.time - stack_threshold > start_time) break;

                const position2 = current.is_slider
                    ? path_end_position(current)
                    : current;

                if (distance(hit_objects[j]!, current) < STACK_DISTANCE) {
                    current.stack_height++;
                    start_time = hit_objects[j]!.time;
                } else if (
                    distance(hit_objects[j]!, position2) < STACK_DISTANCE
                ) {
                    slider_stack++;
                    hit_objects[j]!.stack_height -= slider_stack;
                    start_time = hit_objects[j]!.time;
                }
            }
        }

        return;
    }

    const extended_end_index = hit_objects.length - 1;
    let extended_start_index = 0;

    for (let i = extended_end_index; i > 0; i--) {
        let n = i;
        let object_i = hit_objects[i]!;
        if (object_i.stack_height !== 0 || object_i.is_spinner) continue;

        if (!object_i.is_slider) {
            while (--n >= 0) {
                const object_n = hit_objects[n]!;
                if (object_n.is_spinner) continue;
                if (
                    (jul2026
                        ? Math.trunc(object_i.time) -
                          Math.trunc(object_n.end_time)
                        : object_i.time - object_n.end_time) > stack_threshold
                )
                    break;
                if (n < extended_start_index) {
                    object_n.stack_height = 0;
                    extended_start_index = n;
                }
                if (
                    object_n.is_slider &&
                    distance(end_position(object_n), object_i) < STACK_DISTANCE
                ) {
                    const offset =
                        object_i.stack_height - object_n.stack_height + 1;
                    for (let j = n + 1; j <= i; j++) {
                        const object_j = hit_objects[j]!;
                        if (
                            distance(end_position(object_n), object_j) <
                            STACK_DISTANCE
                        )
                            object_j.stack_height -= offset;
                    }
                    break;
                }
                if (distance(object_n, object_i) < STACK_DISTANCE) {
                    object_n.stack_height = object_i.stack_height + 1;
                    object_i = object_n;
                }
            }
        } else {
            while (--n >= 0) {
                const object_n = hit_objects[n]!;
                if (object_n.is_spinner) continue;
                if (object_i.time - object_n.time > stack_threshold) break;
                if (
                    distance(end_position(object_n), object_i) < STACK_DISTANCE
                ) {
                    object_n.stack_height = object_i.stack_height + 1;
                    object_i = object_n;
                }
            }
        }
    }
}

export function parse_osu_content(content: string): BeatmapData {
    const lines = content.split(/\r?\n/);

    let in_general = false;
    let in_difficulty = false;
    const format_version = parseInt(
        lines[0]?.match(/^osu file format v(\d+)/)?.[1] ?? "14",
        10,
    );
    let in_hit_objects = false;
    let in_timing_points = false;
    let in_events = false;
    let od = 5,
        ar = 5,
        cs = 5,
        hp = 5;
    let slider_multiplier = 1.4;
    let slider_tick_rate = 1;
    let stack_leniency = 0.7;
    let num_hit_circles = 0;
    let num_sliders = 0;
    let num_spinners = 0;
    let max_combo = 0;
    let last_time = 0;

    const timing_points: {
        time: number;
        beat_length: number;
        uninherited: boolean;
    }[] = [];

    const hit_objects: HitObject[] = [];
    const breaks: BreakPeriod[] = [];

    const LEGACY_SCALE_FUDGE = 1.00041;
    const circle_scale = (circle_size: number = cs) =>
        ((1.0 - (0.7 * (circle_size - 5)) / 5) / 2) * LEGACY_SCALE_FUDGE;
    const circle_radius = (circle_size: number = cs) =>
        64 * circle_scale(circle_size);

    const bezier_point = (
        control_points: { x: number; y: number }[],
        progress: number,
    ) => {
        let points = control_points.map((p) => ({ ...p }));
        while (points.length > 1) {
            points = points.slice(0, -1).map((p, i) => ({
                x: p.x + (points[i + 1]!.x - p.x) * progress,
                y: p.y + (points[i + 1]!.y - p.y) * progress,
            }));
        }

        return points[0]!;
    };

    const SLIDER_PATH_SAMPLE_DISTANCE = 1.8;
    const MIN_SLIDER_PATH_SAMPLES = 32;
    const MAX_SLIDER_PATH_SAMPLES = 4096;

    const sample_count_for = (pixel_length: number) =>
        Math.max(
            MIN_SLIDER_PATH_SAMPLES,
            Math.min(
                MAX_SLIDER_PATH_SAMPLES,
                Math.ceil(pixel_length / SLIDER_PATH_SAMPLE_DISTANCE),
            ),
        );

    const adjust_path_distance = (
        points: { x: number; y: number }[],
        expected_distance: number,
    ) => {
        if (points.length < 2) return points;

        const cumulative: number[] = [0];
        let calculated_length = 0;
        for (let i = 0; i < points.length - 1; i++) {
            calculated_length += distance(points[i]!, points[i + 1]!);
            cumulative.push(calculated_length);
        }

        if (calculated_length === expected_distance) return points;

        const last = points[points.length - 1]!;
        const previous = points[points.length - 2]!;
        if (
            last.x === previous.x &&
            last.y === previous.y &&
            expected_distance > calculated_length
        ) {
            return points;
        }

        if (expected_distance <= 0) return [points[0]!];

        if (calculated_length > expected_distance) {
            let end_index = 1;
            while (
                end_index < cumulative.length &&
                cumulative[end_index]! < expected_distance
            ) {
                end_index++;
            }

            const start = points[end_index - 1]!;
            const end = points[end_index] ?? start;
            const start_distance = cumulative[end_index - 1]!;
            const end_distance = cumulative[end_index] ?? start_distance;
            const segment_length = end_distance - start_distance;
            if (segment_length <= 0) return points.slice(0, end_index);

            const progress =
                (expected_distance - start_distance) / segment_length;
            return [
                ...points.slice(0, end_index),
                {
                    x: start.x + (end.x - start.x) * progress,
                    y: start.y + (end.y - start.y) * progress,
                },
            ];
        }

        const last_segment_length =
            calculated_length - cumulative[cumulative.length - 2]!;
        if (last_segment_length <= 0) return points;

        const progress =
            (expected_distance - cumulative[cumulative.length - 2]!) /
            last_segment_length;
        return [
            ...points.slice(0, -1),
            {
                x: previous.x + (last.x - previous.x) * progress,
                y: previous.y + (last.y - previous.y) * progress,
            },
        ];
    };

    const with_path_distances = (
        points: { x: number; y: number }[],
        expected_distance: number,
    ): SliderPathPoint[] => {
        points = adjust_path_distance(points, expected_distance);
        let path_distance = 0;
        return points.map((point, index) => {
            if (index > 0) path_distance += distance(points[index - 1]!, point);
            return { ...point, path_distance };
        });
    };

    const BEZIER_TOLERANCE = 0.25;

    const midpoint = (
        a: { x: number; y: number },
        b: { x: number; y: number },
    ) => ({
        x: Math.fround((a.x + b.x) / 2),
        y: Math.fround((a.y + b.y) / 2),
    });

    const bezier_is_flat_enough = (
        control_points: { x: number; y: number }[],
    ) => {
        for (let i = 1; i < control_points.length - 1; i++) {
            const previous = control_points[i - 1]!;
            const current = control_points[i]!;
            const next = control_points[i + 1]!;
            const x = previous.x - 2 * current.x + next.x;
            const y = previous.y - 2 * current.y + next.y;
            if (x * x + y * y > BEZIER_TOLERANCE * BEZIER_TOLERANCE * 4)
                return false;
        }

        return true;
    };

    const bezier_subdivide = (control_points: { x: number; y: number }[]) => {
        const count = control_points.length;
        const left = new Array<{ x: number; y: number }>(count);
        const right = new Array<{ x: number; y: number }>(count);
        const subdivision = control_points.map((point) => ({ ...point }));

        left[0] = subdivision[0]!;
        right[count - 1] = subdivision[count - 1]!;

        for (let i = 1; i < count; i++) {
            for (let j = 0; j < count - i; j++) {
                subdivision[j] = midpoint(subdivision[j]!, subdivision[j + 1]!);
            }

            left[i] = subdivision[0]!;
            right[count - i - 1] = subdivision[count - i - 1]!;
        }

        return { left, right };
    };

    const bezier_approximate = (
        control_points: { x: number; y: number }[],
        output: { x: number; y: number }[],
    ) => {
        const count = control_points.length;
        const { left, right } = bezier_subdivide(control_points);
        const points = [...left, ...right.slice(1)];

        output.push(control_points[0]!);

        for (let i = 1; i < count - 1; i++) {
            const index = 2 * i;
            output.push({
                x: Math.fround(
                    0.25 *
                        (points[index - 1]!.x +
                            2 * points[index]!.x +
                            points[index + 1]!.x),
                ),
                y: Math.fround(
                    0.25 *
                        (points[index - 1]!.y +
                            2 * points[index]!.y +
                            points[index + 1]!.y),
                ),
            });
        }
    };

    const approximate_bezier = (control_points: { x: number; y: number }[]) => {
        if (control_points.length < 2) return [...control_points];

        const output: { x: number; y: number }[] = [];
        const to_flatten = [control_points];

        while (to_flatten.length > 0) {
            const parent = to_flatten.pop()!;

            if (bezier_is_flat_enough(parent)) {
                bezier_approximate(parent, output);
                continue;
            }

            const { left, right } = bezier_subdivide(parent);
            to_flatten.push(right);
            to_flatten.push(left);
        }

        output.push(control_points[control_points.length - 1]!);
        return output;
    };

    const approximate_perfect_curve = (points: { x: number; y: number }[]) => {
        if (points.length !== 3) return approximate_bezier(points);

        const a = points[0]!;
        const b = points[1]!;
        const c = points[2]!;
        const d =
            2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));

        if (Math.abs(d) < 0.001) return points;

        const center = {
            x:
                ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
                    (b.x * b.x + b.y * b.y) * (c.y - a.y) +
                    (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
                d,
            y:
                ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
                    (b.x * b.x + b.y * b.y) * (a.x - c.x) +
                    (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
                d,
        };
        const radius = distance(center, a);
        const start_angle = Math.atan2(a.y - center.y, a.x - center.x);
        const mid_angle = Math.atan2(b.y - center.y, b.x - center.x);
        const end_angle = Math.atan2(c.y - center.y, c.x - center.x);

        const normalize = (angle: number) => {
            while (angle < 0) angle += Math.PI * 2;
            while (angle >= Math.PI * 2) angle -= Math.PI * 2;
            return angle;
        };
        const angle_distance = (from: number, to: number) => {
            const distance = normalize(to) - normalize(from);
            return distance < 0 ? distance + Math.PI * 2 : distance;
        };

        const ccw_sweep = angle_distance(start_angle, end_angle);
        const ccw_mid = angle_distance(start_angle, mid_angle);
        const sweep =
            ccw_mid <= ccw_sweep ? ccw_sweep : ccw_sweep - Math.PI * 2;
        const theta_range = Math.abs(sweep);
        const point_count =
            2 * radius <= 0.1
                ? 2
                : Math.max(
                      2,
                      Math.ceil(
                          theta_range / (2 * Math.acos(1 - 0.1 / radius)),
                      ),
                  );

        if (point_count >= 1000) return approximate_bezier(points);

        const approximated: { x: number; y: number }[] = [];
        for (let i = 0; i < point_count; i++) {
            const angle = start_angle + sweep * (i / (point_count - 1));
            approximated.push({
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius,
            });
        }

        return approximated;
    };

    const build_slider_path = (
        curve_type: string,
        control_points: { x: number; y: number }[],
        pixel_length: number,
    ) => {
        if (curve_type === "P") {
            return with_path_distances(
                approximate_perfect_curve(control_points),
                pixel_length,
            );
        }
        if (curve_type === "B") {
            const segments: { x: number; y: number }[][] = [];
            let segment: { x: number; y: number }[] = [];

            for (const point of control_points) {
                if (
                    segment.length > 0 &&
                    point.x === segment[segment.length - 1]!.x &&
                    point.y === segment[segment.length - 1]!.y
                ) {
                    segments.push(segment);
                    segment = [point];
                } else {
                    segment.push(point);
                }
            }
            if (segment.length > 0) segments.push(segment);

            const points = segments.flatMap((s, i) => {
                const approximated = approximate_bezier(s);
                return i === 0 ? approximated : approximated.slice(1);
            });

            return with_path_distances(points, pixel_length);
        }

        return with_path_distances(control_points, pixel_length);
    };

    const get_timing_beat_length = (time: number) => {
        let beat_length = 500;
        for (const tp of timing_points) {
            if (tp.time > time) break;
            if (tp.uninherited) beat_length = tp.beat_length;
        }
        return beat_length;
    };

    const get_precision_adjusted_beat_length = (time: number) => {
        const beat_length = get_timing_beat_length(time);
        const slider_velocity = get_sv(time);
        const slider_velocity_as_beat_length = -100 / slider_velocity;
        const bpm_multiplier =
            slider_velocity_as_beat_length < 0
                ? Math.max(
                      10,
                      Math.min(
                          1000,
                          Math.fround(-slider_velocity_as_beat_length),
                      ),
                  ) / 100
                : 1;

        return beat_length * bpm_multiplier;
    };

    const compute_lazy_slider = (
        start: { x: number; y: number },
        curve_type: string,
        control_points: { x: number; y: number }[],
        time: number,
        span_count: number,
        pixel_length: number,
    ) => {
        const path = build_slider_path(
            curve_type,
            control_points,
            pixel_length,
        );
        const follow_radius = circle_radius() * 3;
        const beat_length = get_timing_beat_length(time);
        const adjusted_beat_length = get_precision_adjusted_beat_length(time);
        const velocity = (100 * slider_multiplier) / adjusted_beat_length;
        const span_duration = pixel_length / velocity;
        const duration = span_duration * span_count;
        const slider_end_time = time + duration;

        // Keep the official NestedHitObjects order and path progress. The
        // difficulty calculator uses both, because sorting by time loses the
        // distinction between ticks and repeats and can change the final-tick
        // reordering used by the July 2026 lazy cursor algorithm.
        const nested_events: SliderNestedEvent[] = [
            { time, path_progress: 0, type: "head" },
        ];

        const tick_distance = (velocity * beat_length) / slider_tick_rate;
        const min_distance_from_end = velocity * 10;
        for (let span = 0; span < span_count; span++) {
            const span_start_time = time + span * span_duration;
            const reversed = span % 2 === 1;
            const ticks: SliderNestedEvent[] = [];

            for (
                let distance = tick_distance;
                distance <= pixel_length;
                distance += tick_distance
            ) {
                if (distance >= pixel_length - min_distance_from_end) break;

                const path_progress = distance / pixel_length;
                const time_progress = reversed
                    ? 1 - path_progress
                    : path_progress;
                ticks.push({
                    time: span_start_time + time_progress * span_duration,
                    path_progress,
                    type: "tick",
                });
            }

            if (reversed) ticks.reverse();
            nested_events.push(...ticks);

            if (span < span_count - 1) {
                nested_events.push({
                    time: span_start_time + span_duration,
                    path_progress: (span + 1) % 2,
                    type: "repeat",
                });
            }
        }

        nested_events.push({
            time: slider_end_time,
            path_progress: span_count % 2,
            type: "tail",
        });

        const nested_times = nested_events
            .map((event) => event.time)
            .sort((a, b) => a - b);

        const position_at_progress = (progress: number) => {
            const span_progress = (progress * span_count) % 1;
            const span = Math.floor(progress * span_count);
            const path_progress =
                span % 2 === 1 ? 1 - span_progress : span_progress;
            const p = point_at_slider_path(path, path_progress * pixel_length);
            return { x: start.x + p.x, y: start.y + p.y };
        };

        let lazy_end = { ...start };
        let lazy_travel_distance = 0;

        for (const nested_time of nested_times) {
            // progress = (time - startTime) / duration (may2018 linear mapping)
            const progress = (nested_time - time) / duration;
            const p = position_at_progress(progress);
            const dist = distance(p, lazy_end);
            if (dist > follow_radius) {
                const movement = dist - follow_radius;
                lazy_end = {
                    x: lazy_end.x + ((p.x - lazy_end.x) / dist) * movement,
                    y: lazy_end.y + ((p.y - lazy_end.y) / dist) * movement,
                };
                lazy_travel_distance += movement;
            }
        }

        return {
            lazy_end_x: lazy_end.x,
            lazy_end_y: lazy_end.y,
            lazy_travel_distance,
            slider_end_time,
            duration,
            nested_times,
            nested_events,
            path,
        };
    };

    // Helper to get SV at a given time
    const get_sv = (time: number) => {
        let sv = 1.0;
        for (let i = timing_points.length - 1; i >= 0; i--) {
            const tp = timing_points[i]!;
            if (tp.time <= time) {
                if (!tp.uninherited && tp.beat_length < 0) {
                    sv = Math.max(0.1, Math.min(10.0, -100.0 / tp.beat_length));
                }
                break;
            }
        }
        return sv;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "[Difficulty]") {
            in_general = false;
            in_difficulty = true;
            in_hit_objects = false;
            in_timing_points = false;
            continue;
        }
        if (trimmed === "[General]") {
            in_general = true;
            in_difficulty = false;
            in_events = false;
            in_hit_objects = false;
            in_timing_points = false;
            continue;
        }
        if (trimmed === "[Events]") {
            in_general = false;
            in_difficulty = false;
            in_events = true;
            in_hit_objects = false;
            in_timing_points = false;
            continue;
        }
        if (trimmed === "[TimingPoints]") {
            in_general = false;
            in_difficulty = false;
            in_events = false;
            in_hit_objects = false;
            in_timing_points = true;
            continue;
        }
        if (trimmed === "[HitObjects]") {
            in_general = false;
            in_difficulty = false;
            in_events = false;
            in_hit_objects = true;
            in_timing_points = false;
            timing_points.sort((a, b) => a.time - b.time);
            continue;
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            in_general = false;
            in_difficulty = false;
            in_events = false;
            in_hit_objects = false;
            in_timing_points = false;
            continue;
        }

        if (in_general) {
            const match = trimmed.match(/^(\w+):(.+)$/);
            if (match && match[1] === "StackLeniency") {
                stack_leniency = parseFloat(match[2]!);
            }
        }

        if (in_difficulty) {
            const match = trimmed.match(/^(\w+):(.+)$/);
            if (match) {
                const key = match[1]!;
                const val = parseFloat(match[2]!);
                switch (key) {
                    case "OverallDifficulty":
                        od = val;
                        break;
                    case "ApproachRate":
                        ar = val;
                        break;
                    case "CircleSize":
                        cs = val;
                        break;
                    case "HPDrainRate":
                        hp = val;
                        break;
                    case "SliderMultiplier":
                        slider_multiplier = val;
                        break;
                    case "SliderTickRate":
                        slider_tick_rate = val;
                        break;
                }
            }
        }

        if (in_timing_points && trimmed.length > 0) {
            const parts = trimmed.split(",");
            if (parts.length >= 2) {
                const time = parseFloat(parts[0]!);
                const beat_length = parseFloat(parts[1]!);
                const uninherited =
                    parts.length > 6 ? parseInt(parts[6]!, 10) === 1 : true;
                timing_points.push({ time, beat_length, uninherited });
            }
        }

        if (in_events && trimmed.length > 0 && !trimmed.startsWith("//")) {
            const parts = trimmed.split(",");
            if (parts[0] === "2" && parts.length >= 3) {
                breaks.push({
                    start_time: parseFloat(parts[1]!),
                    end_time: parseFloat(parts[2]!),
                });
            }
        }

        if (in_hit_objects && trimmed.length > 0) {
            // Hit object: x,y,time,type,hitSound,extras
            const parts = trimmed.split(",");
            const x = parseFloat(parts[0]!);
            const y = parseFloat(parts[1]!);
            const time = parseFloat(parts[2]!);
            const type = parseInt(parts[3]!, 10);
            // type & 0x03: 0=circle, 1=slider, 3=spinner
            const is_circle = (type & 1) !== 0;
            const is_slider = (type & 2) !== 0;
            const is_spinner = (type & 8) !== 0;

            const hit_object: HitObject = {
                x,
                y,
                time,
                is_spinner,
                is_slider,
                stack_height: 0,
                stacked_x: x,
                stacked_y: y,
                end_time: time,
            };

            if (is_circle) {
                num_hit_circles++;
                max_combo++;
            } else if (is_slider) {
                num_sliders++;
                max_combo++; // head

                if (parts.length >= 8) {
                    const slides = parseInt(parts[6]!, 10);
                    const length = parseFloat(parts[7]!);

                    const sv = get_sv(time);
                    const scoring_distance = 100 * slider_multiplier * sv;
                    const tick_distance = scoring_distance / slider_tick_rate;

                    const path_parts = parts[5]!.split("|");
                    const curve_type = path_parts[0]!;
                    const control_points = [{ x: 0, y: 0 }];
                    for (const point of path_parts.slice(1)) {
                        const [px, py] = point.split(":").map(Number);
                        control_points.push({ x: px! - x, y: py! - y });
                    }

                    const lazy = compute_lazy_slider(
                        { x, y },
                        curve_type,
                        control_points,
                        time,
                        slides,
                        length,
                    );
                    hit_object.lazy_end_x = lazy.lazy_end_x;
                    hit_object.lazy_end_y = lazy.lazy_end_y;
                    hit_object.lazy_travel_distance = lazy.lazy_travel_distance;
                    hit_object.end_time = lazy.slider_end_time;
                    hit_object.slider_path = lazy.path;
                    hit_object.slider_span_count = slides;
                    hit_object.slider_pixel_length = length;
                    hit_object.slider_duration = lazy.duration;
                    hit_object.slider_nested_times = lazy.nested_times;
                    hit_object.slider_nested_events = lazy.nested_events;

                    const end_path_progress = slides % 2 === 0 ? 0 : 1;
                    const end_pt = point_at_slider_path(
                        lazy.path,
                        end_path_progress * length,
                    );
                    hit_object.end_x = x + end_pt.x;
                    hit_object.end_y = y + end_pt.y;

                    // The number of ticks per slide
                    let ticks = 0;
                    if (tick_distance > 0 && length > 0) {
                        const velocity =
                            scoring_distance / get_timing_beat_length(time);
                        const min_distance_from_end = velocity * 0.01;
                        let d = tick_distance;
                        while (
                            d <= length &&
                            d <= length - min_distance_from_end
                        ) {
                            ticks++;
                            d += tick_distance;
                        }
                    }

                    // For each slide: we get (ticks) combo.
                    // Plus 1 combo for each reverse arrow and tail.
                    max_combo += slides * ticks; // Ticks
                    max_combo += slides; // 1 for each reverse + 1 for tail = slides
                }
            } else if (is_spinner) {
                num_spinners++;
                max_combo++;
                if (parts.length >= 6) {
                    hit_object.end_time = parseFloat(parts[5]!);
                }
            }
            hit_objects.push(hit_object);
            last_time = time;
        }
    }

    hit_objects.sort((a, b) => a.time - b.time);

    // ── Stacking Algorithm (may2018 OsuBeatmapProcessor.applyStacking) ──
    const obj_scale = circle_scale(cs);

    apply_osu_stacking(hit_objects, ar, stack_leniency, format_version);

    // Apply StackOffset = StackHeight * Scale * (-6.4, -6.4)
    for (const ho of hit_objects) {
        const offset = ho.stack_height * obj_scale * -6.4;
        ho.stacked_x = ho.x + offset;
        ho.stacked_y = ho.y + offset;
    }

    return {
        od,
        ar,
        cs,
        hp,
        format_version,
        stack_leniency,
        num_hit_circles,
        num_sliders,
        num_spinners,
        max_combo,
        breaks,
        hit_objects,
    };
}
