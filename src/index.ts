import type { BeatmapData, ScoreData } from "./BeatmapData";
import { parse_osu_content } from "./BeatmapData";
import PpCalculator, {
    calculate_bonus_pp,
    calculate_profile_pp,
    RULESET_IDS,
    type PpCalculatorOptions,
    type PpCalculatorResult,
    type ProfilePpBreakdown,
    type RulesetId,
} from "./PpCalculator";
import Mar2025PpCalculator from "./mar2025/Mar2025PpCalculator";
import Oct2024PpCalculator from "./oct2024/Oct2024PpCalculator";

export type SupportedRework = "mar2025" | "oct2024";

export interface CreatePpCalculatorOptions {
    /** PP rework implementation to use. Defaults to mar2025. */
    rework?: SupportedRework;
    /** Only scores from this ruleset are accepted. Pass null to disable scoping. */
    rulesetId?: RulesetId | null;
}

export interface CalculateScoreOptions extends CreatePpCalculatorOptions {
    /** Score data from the osu! API, normalised to the calculator schema. */
    score: ScoreData;
    /** Parsed beatmap data or raw .osu file content. */
    beatmap: BeatmapData | string;
}

export const rulesets = RULESET_IDS;

export const reworks = {
    mar2025: "mar2025",
    oct2024: "oct2024",
} as const satisfies Record<SupportedRework, SupportedRework>;

export function parseBeatmap(content: string): BeatmapData {
    return parse_osu_content(content);
}

export function createPpCalculator(
    options: CreatePpCalculatorOptions = {},
): PpCalculator {
    const calculator_options: PpCalculatorOptions = {
        ruleset_id: options.rulesetId,
    };

    switch (options.rework ?? reworks.mar2025) {
        case reworks.mar2025:
            return new Mar2025PpCalculator(calculator_options);
        case reworks.oct2024:
            return new Oct2024PpCalculator(calculator_options);
    }
}

export function calculateScore({
    score,
    beatmap,
    rework,
    rulesetId,
}: CalculateScoreOptions): PpCalculatorResult {
    const calculator = createPpCalculator({ rework, rulesetId });
    const beatmap_data =
        typeof beatmap === "string" ? parseBeatmap(beatmap) : beatmap;

    return calculator.calculate_score(score, beatmap_data);
}

export {
    calculate_bonus_pp as calculateBonusPp,
    calculate_profile_pp as calculateProfilePp,
    Mar2025PpCalculator,
    Oct2024PpCalculator,
};

export type {
    BeatmapData,
    PpCalculatorResult,
    ProfilePpBreakdown,
    RulesetId,
    ScoreData,
};
