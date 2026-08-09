import type { BeatmapData, HitObject, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";

const STAR_SCALING_FACTOR = 0.0675;
const DECAY_WEIGHT = 0.9;
const STRAIN_STEP = 400;

function mod_names(score: ScoreData): string[] {
    return (score.mods ?? []).map((mod) => mod.acronym);
}

function apply_mods(beatmap: BeatmapData, mods: string[]) {
    const has = (mod: string) => mods.includes(mod);
    const speed = has("DT") || has("NC") ? 1.5 : has("HT") ? 0.75 : 1;
    const multiplier = has("HR") ? 1.4 : has("EZ") ? 0.5 : 1;
    const od = Math.fround(beatmap.od * multiplier);
    const od_ms = Math.fround(
        Math.min(79.5, Math.max(19.5, 79.5 - Math.ceil(6 * od))),
    );
    const effective_od = Math.fround((79.5 - od_ms / speed) / 6);
    const ar = Math.fround(beatmap.ar * multiplier);
    const ar_ms = ar <= 5 ? 1800 - 120 * ar : 1200 - 150 * (ar - 5);
    const effective_ar_ms = Math.min(1800, Math.max(450, ar_ms)) / speed;
    const effective_ar = Math.fround(
        effective_ar_ms > 1200
            ? (1800 - effective_ar_ms) / 120
            : 5 + (1200 - effective_ar_ms) / 150,
    );
    const effective_cs = Math.max(
        0,
        Math.min(10, beatmap.cs * (has("HR") ? 1.3 : has("EZ") ? 0.5 : 1)),
    );

    return { speed, effective_ar, effective_od, effective_cs };
}

function spacing_weight(distance: number, speed: boolean): number {
    if (!speed) return distance ** 0.99;
    if (distance > 125) return 2.5;
    if (distance > 110) return 1.6 + (0.9 * (distance - 110)) / 15;
    if (distance > 90) return 1.2 + (0.4 * (distance - 90)) / 20;
    if (distance > 45) return 0.95 + (0.25 * (distance - 45)) / 45;
    return 0.95;
}

function calculate_strain(
    objects: HitObject[],
    cs: number,
    speed_multiplier: number,
    speed: boolean,
): number {
    const radius = Math.fround(32 * (1 - (0.7 * (cs - 5)) / 5));
    let scaling = 52 / radius;
    if (radius < 30) scaling *= 1 + Math.min(30 - radius, 5) / 50;

    const strains: number[] = [];
    let max_strain = 0;
    let interval_end = STRAIN_STEP * speed_multiplier;
    let previous_strain = 0;
    let previous_time = 0;

    for (let index = 0; index < objects.length; index++) {
        const object = objects[index]!;
        const current_x = object.is_spinner ? 256 : Math.fround(object.x);
        const current_y = object.is_spinner ? 192 : Math.fround(object.y);
        let strain = 0;

        if (index > 0) {
            const elapsed = (object.time - previous_time) / speed_multiplier;
            const previous = objects[index - 1]!;
            const previous_x = previous.is_spinner
                ? 256
                : Math.fround(previous.x);
            const previous_y = previous.is_spinner
                ? 192
                : Math.fround(previous.y);
            const decay = Math.pow(speed ? 0.3 : 0.15, elapsed / 1000);
            let raw = 0;
            if (!object.is_spinner) {
                const distance = Math.hypot(
                    (current_x - previous_x) * scaling,
                    (current_y - previous_y) * scaling,
                );
                const weight = spacing_weight(distance, speed);
                raw = (weight * (speed ? 1400 : 26.25)) / Math.max(elapsed, 50);
            }
            strain = previous_strain * decay + raw;
        }

        while (object.time > interval_end) {
            strains.push(index === 0 ? 0 : max_strain);
            max_strain =
                previous_strain *
                Math.pow(
                    speed ? 0.3 : 0.15,
                    (interval_end - previous_time) / 1000,
                );
            interval_end += STRAIN_STEP * speed_multiplier;
        }

        max_strain = Math.max(max_strain, strain);
        previous_strain = strain;
        previous_time = object.time;
    }
    strains.sort((a, b) => b - a);

    let result = 0;
    let weight = 1;
    for (const strain of strains) {
        result += strain * weight;
        weight *= DECAY_WEIGHT;
    }
    return result;
}

function base_pp(stars: number): number {
    return (5 * Math.max(1, stars / STAR_SCALING_FACTOR) - 4) ** 3 / 100000;
}

function rounded_statistics(
    accuracy_percent: number,
    object_count: number,
    misses: number,
) {
    const clamped_misses = Math.min(object_count, misses);
    const max_300 = object_count - clamped_misses;
    const clamped_accuracy = Math.max(
        0,
        Math.min(
            ((max_300 * 300) / (object_count * 300)) * 100,
            accuracy_percent,
        ),
    );
    const raw_ok = Math.round(
        -3 *
            ((clamped_accuracy * 0.01 - 1) * object_count + clamped_misses) *
            0.5,
    );
    let ok = Math.max(0, Math.min(max_300, raw_ok));
    let meh = 0;
    if (raw_ok > max_300) {
        ok = 0;
        meh = Math.min(
            max_300,
            Math.round(
                -6 *
                    ((clamped_accuracy * 0.01 - 1) * object_count +
                        clamped_misses) *
                    0.2,
            ),
        );
    }
    return {
        great: object_count - clamped_misses - ok - meh,
        ok,
        meh,
        miss: clamped_misses,
    };
}

/**
 * Hidden and aim rebalances
 *
 * https://osu.ppy.sh/home/news/2018-05-16-performance-updates
 *
 * Target: actual pp values (wayback machine)
 */
export default class May2018PpCalculator extends PpCalculator {
    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const source_score = score as ScoreData & { combo?: number };
        const stats = score.statistics as Record<string, number | undefined>;
        const mods = mod_names(score);
        const mod_stats = apply_mods(beatmap, mods);
        const aim_strain = calculate_strain(
            beatmap.hit_objects,
            mod_stats.effective_cs,
            mod_stats.speed,
            false,
        );
        const speed_strain = calculate_strain(
            beatmap.hit_objects,
            mod_stats.effective_cs,
            mod_stats.speed,
            true,
        );
        const aim = Math.sqrt(aim_strain) * STAR_SCALING_FACTOR;
        const speed = Math.sqrt(speed_strain) * STAR_SCALING_FACTOR;
        const star_rating = aim + speed + Math.abs(speed - aim) * 0.5;
        const miss = stats.miss ?? 0;
        const rounded = rounded_statistics(
            score.accuracy ?? 0,
            beatmap.hit_objects.length,
            miss,
        );
        const great = rounded.great;
        const ok = rounded.ok;
        const meh = rounded.meh;
        const total_hits = great + ok + meh + miss;
        const accuracy =
            total_hits > 0
                ? (great * 300 + ok * 100 + meh * 50) / (total_hits * 300)
                : 0;
        const real_great = Math.max(
            0,
            great - beatmap.num_sliders - beatmap.num_spinners,
        );
        const real_total_hits = real_great + ok + meh + miss;
        const real_accuracy =
            real_total_hits > 0
                ? (real_great * 300 + ok * 100 + meh * 50) /
                  (real_total_hits * 300)
                : 0;
        const combo = source_score.combo ?? score.max_combo ?? 0;
        const max_combo = beatmap.max_combo;
        const length_bonus =
            0.95 +
            0.4 * Math.min(1, beatmap.hit_objects.length / 2000) +
            (beatmap.hit_objects.length > 2000
                ? Math.log10(beatmap.hit_objects.length / 2000) * 0.5
                : 0);
        const miss_penalty = 0.97 ** miss;
        const combo_break = max_combo > 0 ? combo ** 0.8 / max_combo ** 0.8 : 0;
        let ar_bonus = 1;
        if (mod_stats.effective_ar > 10.33)
            ar_bonus += 0.45 * (mod_stats.effective_ar - 10.33);
        else if (mod_stats.effective_ar < 8)
            ar_bonus +=
                0.01 *
                (8 - mod_stats.effective_ar) *
                (mods.includes("HD") ? 2 : 1);
        const acc_bonus = 0.5 + accuracy / 2;
        const od_bonus = 0.98 + mod_stats.effective_od ** 2 / 2500;
        let aim_pp =
            base_pp(aim) * length_bonus * miss_penalty * combo_break * ar_bonus;
        if (mods.includes("HD"))
            aim_pp *= 1.02 + (11 - mod_stats.effective_ar) / 50;
        if (mods.includes("FL")) aim_pp *= 1.45 * length_bonus;
        aim_pp *= acc_bonus * od_bonus;
        let speed_pp =
            base_pp(speed) *
            length_bonus *
            miss_penalty *
            combo_break *
            acc_bonus *
            od_bonus;
        if (mods.includes("HD")) speed_pp *= 1.18;
        let accuracy_pp =
            1.52163 ** mod_stats.effective_od * real_accuracy ** 24 * 2.83;
        accuracy_pp *= Math.min(1.15, (beatmap.num_hit_circles / 1000) ** 0.3);
        if (mods.includes("HD") || mods.includes("FL")) accuracy_pp *= 1.02;
        let pp =
            (aim_pp ** 1.1 + speed_pp ** 1.1 + accuracy_pp ** 1.1) **
                (1 / 1.1) *
            1.12;
        if (mods.includes("NF")) pp *= 0.9;
        if (mods.includes("SO")) pp *= 0.95;

        return {
            performance: {
                aim: aim_pp,
                speed: speed_pp,
                accuracy: accuracy_pp,
                effective_miss_count: miss,
                pp,
            },
            difficulty: {
                star_rating,
                max_combo,
                aim_difficulty: aim,
                speed_difficulty: speed,
                approach_rate: mod_stats.effective_ar,
                overall_difficulty: mod_stats.effective_od,
                circle_size: mod_stats.effective_cs,
            },
        };
    }
}
