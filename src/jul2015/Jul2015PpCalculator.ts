import type { BeatmapData, ScoreData } from "../BeatmapData";
import { osu_circle_scale } from "../BeatmapData";
import PpCalculator, {
    type PpCalculatorOptions,
    type PpCalculatorResult,
} from "../PpCalculator";
import {
    apply_mods_to_difficulty,
    calculate_effective_arod,
    prepare_hit_objects_for_difficulty,
} from "../mar2025/DifficultyCalculator";

interface DifficultyHitObject {
    start_time: number;
    delta_time: number;
    distance: number;
}

interface SkillResult {
    difficulty_value: number;
    difficult_strain_count: number;
}

export type Legacy2015Rework = "jan2014" | "feb2015" | "jul2015";

const DIFFICULTY_MULTIPLIER = 0.0675;
const SECTION_LENGTH = 400;
const DECAY_WEIGHT = 0.9;

function mod_names(score: ScoreData): string[] {
    return (score.mods ?? []).map((mod) => mod.acronym);
}

function has_mod(mods: string[], acronym: string): boolean {
    return mods.includes(acronym) || (acronym === "DT" && mods.includes("NC"));
}

function create_difficulty_hit_objects(
    beatmap: BeatmapData,
    mods: string[],
    rework: Legacy2015Rework,
): {
    objects: DifficultyHitObject[];
    effective_ar: number;
    effective_od: number;
    effective_cs: number;
} {
    const { clock_rate, ar, od, cs } = apply_mods_to_difficulty(
        beatmap,
        mods,
        rework,
    );
    const hit_objects = prepare_hit_objects_for_difficulty(
        beatmap,
        mods,
        cs,
        ar,
        rework,
    );
    const { effective_ar, effective_od } = calculate_effective_arod(
        ar,
        od,
        clock_rate,
        rework,
    );
    const objects: DifficultyHitObject[] = [];

    for (let index = 1; index < hit_objects.length; index++) {
        const current = hit_objects[index]!;
        const previous = hit_objects[index - 1]!;
        const radius = Math.fround(64 * osu_circle_scale(cs));
        let scaling_factor = 52 / radius;

        if (radius < 30) {
            scaling_factor *=
                1 +
                (rework === "jan2014" || rework === "feb2015"
                    ? (30 - radius) / 40
                    : Math.min(30 - radius, 5) / 50);
        }

        const stack_offset_x = previous.stacked_x - previous.x;
        const stack_offset_y = previous.stacked_y - previous.y;
        const last_cursor_x =
            rework === "jan2014" && previous.is_slider
                ? (previous.lazy_end_x ?? previous.stacked_x) + stack_offset_x
                : previous.stacked_x;
        const last_cursor_y =
            rework === "jan2014" && previous.is_slider
                ? (previous.lazy_end_y ?? previous.stacked_y) + stack_offset_y
                : previous.stacked_y;
        const dx = Math.fround(current.stacked_x - last_cursor_x);
        const dy = Math.fround(current.stacked_y - last_cursor_y);
        const distance =
            ((previous.is_slider && rework === "jan2014"
                ? (previous.lazy_travel_distance ?? 0)
                : 0) +
                Math.fround(
                    Math.sqrt(
                        Math.fround(
                            Math.fround(dx * dx) + Math.fround(dy * dy),
                        ),
                    ),
                )) *
            scaling_factor;

        objects.push({
            start_time: current.time / clock_rate,
            delta_time: Math.max(
                40,
                (current.time - previous.time) / clock_rate,
            ),
            distance,
        });
    }

    return { objects, effective_ar, effective_od, effective_cs: cs };
}

function calculate_skill(
    objects: DifficultyHitObject[],
    speed: boolean,
): SkillResult {
    const strain_peaks: number[] = [];
    const object_strains: number[] = [];
    let current_strain = 1;
    let current_section_peak = 1;
    let current_section_end = 0;

    for (let index = 0; index < objects.length; index++) {
        const current = objects[index]!;

        if (index === 0) {
            current_section_end =
                Math.ceil(current.start_time / SECTION_LENGTH) * SECTION_LENGTH;
        }

        while (current.start_time > current_section_end) {
            strain_peaks.push(current_section_peak);
            const previous = objects[index - 1];
            current_section_peak = previous
                ? current_strain *
                  (speed ? 0.3 : 0.15) **
                      ((current_section_end - previous.start_time) / 1000)
                : current_strain;
            current_section_end += SECTION_LENGTH;
        }

        current_strain *= (speed ? 0.3 : 0.15) ** (current.delta_time / 1000);
        current_strain +=
            (speed
                ? (1000 * speed_spacing_weight(current.distance)) /
                  current.delta_time
                : current.distance ** 0.99 / current.delta_time) *
            (speed ? 1.4 : 26.25);

        current_section_peak = Math.max(current_strain, current_section_peak);
        object_strains.push(current_strain);
    }

    const peaks = strain_peaks
        .filter((strain) => strain > 0)
        .sort((a, b) => b - a);
    let difficulty_value = 0;
    let weight = 1;

    for (const strain of peaks) {
        difficulty_value += strain * weight;
        weight *= DECAY_WEIGHT;
    }

    const consistent_top_strain = difficulty_value / 10;
    const difficult_strain_count =
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

    return { difficulty_value, difficult_strain_count };
}

function speed_spacing_weight(distance: number): number {
    if (distance > 125) return 2.5;
    if (distance > 110) return 1.6 + (0.9 * (distance - 110)) / 15;
    if (distance > 90) return 1.2 + (0.4 * (distance - 90)) / 20;
    if (distance > 45) return 0.95 + (0.25 * (distance - 45)) / 45;
    return 0.95;
}

function difficulty_to_performance(difficulty: number): number {
    return (
        (5 * Math.max(1, difficulty / DIFFICULTY_MULTIPLIER) - 4) ** 3 / 100000
    );
}

function calculate_difficulty(
    beatmap: BeatmapData,
    mods: string[],
    rework: Legacy2015Rework,
): PpCalculatorResult["difficulty_attributes"] {
    const { objects, effective_ar, effective_od, effective_cs } =
        create_difficulty_hit_objects(beatmap, mods, rework);
    const aim = calculate_skill(objects, false);
    const speed = calculate_skill(objects, true);
    const aim_difficulty =
        Math.sqrt(aim.difficulty_value) * DIFFICULTY_MULTIPLIER;
    const speed_difficulty =
        Math.sqrt(speed.difficulty_value) * DIFFICULTY_MULTIPLIER;

    return {
        star_rating:
            aim_difficulty +
            speed_difficulty +
            Math.abs(aim_difficulty - speed_difficulty) / 2,
        max_combo: beatmap.max_combo,
        aim_difficulty,
        aim_difficult_slider_count: 0,
        speed_difficulty,
        speed_note_count: 0,
        flashlight_difficulty: 0,
        reading_difficulty: 0,
        aim_difficult_strain_count: aim.difficult_strain_count,
        speed_difficult_strain_count: speed.difficult_strain_count,
        reading_difficult_note_count: 0,
        slider_factor: 1,
        aim_top_weighted_slider_factor: 0,
        speed_top_weighted_slider_factor: 0,
        approach_rate: effective_ar,
        overall_difficulty: effective_od,
        circle_size: effective_cs,
    };
}

/**
 * Historical osu! performance calculation from the pp-jul15-dec17 oracle.
 *
 * Target: huismetbenen pp values.
 */
export default class Jul2015PpCalculator extends PpCalculator {
    protected readonly rework: Legacy2015Rework;
    protected readonly approach_rate_bonus_start: number = 10.33;
    protected readonly approach_rate_bonus_multiplier: number = 0.45;
    protected readonly flashlight_length_multiplier: number = 0.45;

    constructor(
        options: PpCalculatorOptions = {},
        rework: Legacy2015Rework = "jul2015",
    ) {
        super(options);
        this.rework = rework;
    }

    protected calculate_performance(
        score: ScoreData,
        beatmap: BeatmapData,
    ): {
        performance: PpCalculatorResult["performance_attributes"];
        difficulty: PpCalculatorResult["difficulty_attributes"];
    } {
        const stats = score.statistics as Record<string, number | undefined>;
        const source_score = score as ScoreData & { combo?: number };
        const mods = mod_names(score);
        const difficulty = calculate_difficulty(beatmap, mods, this.rework);
        const accuracy = (score.accuracy ?? 0) / 100;
        const score_max_combo = source_score.combo ?? score.max_combo ?? 0;
        const great = stats.great ?? 0;
        const ok = stats.ok ?? 0;
        const meh = stats.meh ?? 0;
        const miss = stats.miss ?? 0;
        const total_hits = great + ok + meh + miss;

        if (has_mod(mods, "RX") || has_mod(mods, "AP")) {
            return {
                performance: {
                    aim: 0,
                    speed: 0,
                    accuracy: 0,
                    flashlight: 0,
                    effective_miss_count: miss,
                    pp: 0,
                },
                difficulty,
            };
        }

        const length_bonus =
            0.95 +
            0.4 * Math.min(1, total_hits / 2000) +
            (total_hits > 2000 ? Math.log10(total_hits / 2000) * 0.5 : 0);
        const miss_penalty = 0.97 ** miss;
        const combo_scaling =
            difficulty.max_combo > 0
                ? Math.min(
                      score_max_combo ** 0.8 / difficulty.max_combo ** 0.8,
                      1,
                  )
                : 1;
        const approach_rate_factor =
            difficulty.approach_rate > this.approach_rate_bonus_start
                ? 1 +
                  this.approach_rate_bonus_multiplier *
                      (difficulty.approach_rate -
                          this.approach_rate_bonus_start)
                : difficulty.approach_rate < 8
                  ? 1 +
                    (has_mod(mods, "HD") ? 0.02 : 0.01) *
                        (8 - difficulty.approach_rate)
                  : 1;
        const accuracy_factor = 0.5 + accuracy / 2;
        const overall_difficulty_factor =
            0.98 + difficulty.overall_difficulty ** 2 / 2500;

        let aim =
            difficulty_to_performance(difficulty.aim_difficulty) *
            length_bonus *
            miss_penalty *
            combo_scaling *
            approach_rate_factor;
        if (has_mod(mods, "HD")) aim *= 1.18;
        if (has_mod(mods, "FL"))
            aim *= 1 + this.flashlight_length_multiplier * length_bonus;
        aim *= accuracy_factor * overall_difficulty_factor;

        const speed =
            difficulty_to_performance(difficulty.speed_difficulty) *
            length_bonus *
            miss_penalty *
            combo_scaling *
            accuracy_factor *
            overall_difficulty_factor;

        const amount_hit_objects_with_accuracy = beatmap.num_hit_circles;
        const better_accuracy_percentage = Math.max(
            0,
            amount_hit_objects_with_accuracy > 0
                ? ((great - (total_hits - amount_hit_objects_with_accuracy)) *
                      6 +
                      ok * 2 +
                      meh) /
                      (amount_hit_objects_with_accuracy * 6)
                : 0,
        );
        let accuracy_pp =
            1.52163 ** difficulty.overall_difficulty *
            better_accuracy_percentage ** 24 *
            2.83;
        accuracy_pp *= Math.min(
            1.15,
            (amount_hit_objects_with_accuracy / 1000) ** 0.3,
        );
        if (has_mod(mods, "HD")) accuracy_pp *= 1.02;
        if (has_mod(mods, "FL")) accuracy_pp *= 1.02;

        let pp =
            (aim ** 1.1 + speed ** 1.1 + accuracy_pp ** 1.1) ** (1 / 1.1) *
            1.12;
        if (has_mod(mods, "NF")) pp *= 0.9;
        if (has_mod(mods, "SO")) pp *= 0.95;

        return {
            performance: {
                aim,
                speed,
                accuracy: accuracy_pp,
                flashlight: 0,
                effective_miss_count: miss,
                pp,
            },
            difficulty,
        };
    }
}
