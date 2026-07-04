export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

export function difficulty_range(
    difficulty: number,
    min: number,
    mid: number,
    max: number,
): number {
    if (difficulty > 5) {
        return mid + ((max - mid) * (difficulty - 5)) / 5;
    }
    if (difficulty < 5) {
        return mid - ((mid - min) * (5 - difficulty)) / 5;
    }
    return mid;
}

export function smoothstep(x: number, start: number, end: number): number {
    x = clamp((x - start) / (end - start), 0, 1);
    return x * x * (3 - 2 * x);
}

export function smoothstep_bell_curve(
    x: number,
    mean: number = 0.5,
    width: number = 0.5,
): number {
    x -= mean;
    x = x > 0 ? width - x : width + x;
    return smoothstep(x, 0, width);
}

export function smootherstep(x: number, start: number, end: number): number {
    x = clamp((x - start) / (end - start), 0, 1);
    return x * x * x * (x * (6 * x - 15) + 10);
}

export function reverse_lerp(x: number, start: number, end: number): number {
    return clamp((x - start) / (end - start), 0, 1);
}

export function logistic(
    x: number,
    midpoint_offset: number,
    multiplier: number,
    max_value: number = 1,
): number {
    return max_value / (1 + Math.exp(multiplier * (midpoint_offset - x)));
}

export function milliseconds_to_bpm(ms: number, delimiter: number = 4): number {
    return 60000 / (ms * delimiter);
}

export function bpm_to_milliseconds(
    bpm: number,
    delimiter: number = 4,
): number {
    return 60000 / delimiter / bpm;
}

export function osu_hit_window(
    difficulty: number,
    min: number,
    mid: number,
    max: number,
): number {
    return Math.floor(difficulty_range(difficulty, min, mid, max)) - 0.5;
}

export function erf(x: number): number {
    if (x === 0) return 0;
    if (x === Infinity) return 1;
    if (x === -Infinity) return -1;
    if (Number.isNaN(x)) return Number.NaN;

    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const tau =
        t *
        (0.254829592 +
            t *
                (-0.284496736 +
                    t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const value = 1 - tau * Math.exp(-x * x);

    return x >= 0 ? value : -value;
}

export function erf_inv(x: number): number {
    if (x <= -1) return -Infinity;
    if (x >= 1) return Infinity;
    if (x === 0) return 0;

    const a = 0.147;
    const sign = Math.sign(x);
    x = Math.abs(x);

    const ln = Math.log(1 - x * x);
    const t1 = 2 / (Math.PI * a) + ln / 2;
    const t2 = ln / a;
    const base_approx = Math.sqrt(t1 * t1 - t2) - t1;
    const correction = x >= 0.85 ? ((x - 0.85) / 0.293) ** 8 : 0;

    return sign * (Math.sqrt(base_approx) + correction);
}
