import type { BeatmapData, ScoreData } from "./BeatmapData";

export interface PpCalculatorResult {
    score: {
        /** 0 = standard, 1 = taiko, 2 = catch, 3 = mania */
        ruleset_id: number;
        /** Beatmap ID */
        beatmap_id: number;
        /** Mods used in the score. */
        mods: { acronym: string }[];
        total_score: number;
        legacy_total_score: number;
        /** Accuracy % of the score, 0-100 */
        accuracy: number;
        /** Highest combo achieved in the score */
        max_combo: number;
        /** When the score was set, as an ISO timestamp when available. */
        ended_at?: string | null;
        /** osu! grade for the score, for example A, S, SH, X, or XH. */
        rank?: string | null;
        /** Whether osu! marked the score as passed. */
        passed?: boolean;
        /** Whether osu! marked the score as a perfect combo. */
        is_perfect_combo?: boolean;
    };
    performance_attributes: {
        /** Aim PP */
        aim: number;
        /** Speed PP */
        speed: number;
        /** Accuracy PP */
        accuracy: number;
        /** Flashlight PP */
        flashlight?: number;
        /**
         * Miss count after accounting for sliderbreaks.
         * 100% accurate on Lazer scores but may be off on Classic scores (sliderbreak estimation from combo needed).
         */
        effective_miss_count: number;
        /** Estimated tap deviation on speed notes */
        speed_deviation?: number;
        /** Estimated misses inferred from combo only */
        combo_based_estimated_miss_count?: number;
        /** Estimated misses inferred from legacy score */
        score_based_estimated_miss_count?: number;
        /** Estimated slider breaks used by aim miss penalty */
        aim_estimated_slider_breaks?: number;
        /** Estimated slider breaks used by speed miss penalty */
        speed_estimated_slider_breaks?: number;
        /** Total PP */
        pp: number;
    };
    difficulty_attributes: {
        /** Star Rating of this beatmap */
        star_rating: number;
        /** Maximum combo achievable on this beatmap */
        max_combo: number;
        /** Aim Difficulty of this beatmap */
        aim_difficulty: number;
        /** Number of difficult sliders weighted by aim difficulty */
        aim_difficult_slider_count?: number;
        /** Speed Difficulty of this beatmap */
        speed_difficulty: number;
        /** Number of clickable objects weighted by speed difficulty */
        speed_note_count?: number;
        /** Flashlight Difficulty of this beatmap */
        flashlight_difficulty?: number;
        /** Reading Difficulty of this beatmap */
        reading_difficulty?: number;
        /** Aim Difficulty Strain Count of this beatmap */
        aim_difficult_strain_count?: number;
        /** Speed Difficulty Strain Count of this beatmap */
        speed_difficult_strain_count?: number;
        /** Number of difficult readable notes weighted by reading difficulty */
        reading_difficult_note_count?: number;
        /** Ratio of aim difficulty contributed by hitcircles vs sliders */
        slider_factor?: number;
        /** Ratio of top weighted aim strain contributed by sliders */
        aim_top_weighted_slider_factor?: number;
        /** Ratio of top weighted speed strain contributed by sliders */
        speed_top_weighted_slider_factor?: number;
        /** Legacy nested score contribution per object */
        nested_score_per_object?: number;
        /** Legacy score base multiplier */
        legacy_score_base_multiplier?: number;
        /** Maximum legacy combo score */
        maximum_legacy_combo_score?: number;
        /** Approach Rate of this beatmap */
        approach_rate: number;
        /** Overall Difficulty of this beatmap */
        overall_difficulty: number;
        /** Circle Size of this beatmap */
        circle_size: number;
    };
    /** User ID of the score setter */
    user_id: number;
    /** Score ID */
    score_id: number;
}

export interface ProfilePpBreakdown {
    score_count: number;
    weighted_pp: number;
    bonus_pp: number;
    total_pp: number;
}

export const RULESET_IDS = {
    osu: 0,
    taiko: 1,
    catch: 2,
    mania: 3,
} as const;

export type RulesetId = (typeof RULESET_IDS)[keyof typeof RULESET_IDS];

export interface PpCalculatorOptions {
    /** Only scores from this ruleset are accepted. Pass null to disable scoping. */
    ruleset_id?: RulesetId | null;
}

const ruleset_names = new Map<number, string>([
    [RULESET_IDS.osu, "osu"],
    [RULESET_IDS.taiko, "taiko"],
    [RULESET_IDS.catch, "catch"],
    [RULESET_IDS.mania, "mania"],
]);

function format_ruleset_id(ruleset_id: number | null): string {
    if (ruleset_id === null) return "any ruleset";

    return `${ruleset_names.get(ruleset_id) ?? "unknown"} (${ruleset_id})`;
}

export function calculate_bonus_pp(unique_score_count: number): number {
    return (417 - 1 / 3) * (1 - 0.995 ** Math.min(1000, unique_score_count));
}

export function calculate_profile_pp(
    results: PpCalculatorResult[],
): ProfilePpBreakdown {
    const best_by_beatmap = new Map<number, PpCalculatorResult>();

    for (const result of results) {
        const previous_best = best_by_beatmap.get(result.score.beatmap_id);
        if (
            !previous_best ||
            result.performance_attributes.pp >
                previous_best.performance_attributes.pp
        ) {
            best_by_beatmap.set(result.score.beatmap_id, result);
        }
    }

    const best_scores = Array.from(best_by_beatmap.values()).sort(
        (a, b) => b.performance_attributes.pp - a.performance_attributes.pp,
    );

    const weighted_pp = best_scores.reduce(
        (total, result, index) =>
            total + result.performance_attributes.pp * 0.95 ** index,
        0,
    );
    const bonus_pp = calculate_bonus_pp(best_scores.length);

    return {
        score_count: best_scores.length,
        weighted_pp: weighted_pp,
        bonus_pp: bonus_pp,
        total_pp: weighted_pp + bonus_pp,
    };
}

export default abstract class PpCalculator {
    private readonly scoped_ruleset_id: RulesetId | null;

    constructor(options: PpCalculatorOptions = {}) {
        this.scoped_ruleset_id =
            options.ruleset_id === undefined
                ? RULESET_IDS.osu
                : options.ruleset_id;
    }

    calculate_score(
        score: ScoreData,
        beatmap: BeatmapData,
    ): PpCalculatorResult {
        if (!this.is_score_in_scope(score))
            throw new Error(
                `${this.constructor.name} is scoped to ${format_ruleset_id(this.scoped_ruleset_id)} scores but received ${format_ruleset_id(score.ruleset_id)} score ${score.id}.`,
            );

        const source_score = score as ScoreData & {
            ended_at?: string | null;
            rank?: string | null;
            passed?: boolean;
            is_perfect_combo?: boolean;
            legacy_perfect?: boolean;
        };

        const { performance, difficulty } = this.calculate_performance(
            score,
            beatmap,
        );

        return {
            performance_attributes: performance,
            difficulty_attributes: difficulty,
            score: {
                ...score,
                is_perfect_combo: Boolean(
                    source_score.is_perfect_combo ??
                    source_score.legacy_perfect,
                ),
            },
            user_id: score.user_id,
            score_id: score.id,
        };
    }

    protected abstract calculate_performance(
        score: ScoreData,
        beatmap: BeatmapData,
    ): {
        performance: PpCalculatorResult["performance_attributes"];
        difficulty: PpCalculatorResult["difficulty_attributes"];
    };

    private is_score_in_scope(score: ScoreData) {
        return (
            this.scoped_ruleset_id === null ||
            score.ruleset_id === this.scoped_ruleset_id
        );
    }
}
