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
import Jul2026PpCalculator from "./jul2026/Jul2026PpCalculator";
import Mar2025PpCalculator from "./mar2025/Mar2025PpCalculator";
import Oct2024PpCalculator from "./oct2024/Oct2024PpCalculator";
import Oct2025PpCalculator from "./oct2025/Oct2025PpCalculator";
import Sep2022PpCalculator from "./sep2022/Sep2022PpCalculator";

export type SupportedRework =
    "jul2026" | "oct2025" | "mar2025" | "oct2024" | "sep2022";

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
    jul2026: "jul2026",
    oct2025: "oct2025",
    mar2025: "mar2025",
    oct2024: "oct2024",
    sep2022: "sep2022",
} as const satisfies Record<SupportedRework, SupportedRework>;

export function parseBeatmap(content: string): BeatmapData {
    return parse_osu_content(content);
}

/**
 * Creates a new PpCalculator instance based on the specified options.
 * @returns A PpCalculator instance corresponding to the specified PP rework and ruleset.
 */
export function createPpCalculator(
    options: CreatePpCalculatorOptions = {},
): PpCalculator {
    const calculator_options: PpCalculatorOptions = {
        ruleset_id: options.rulesetId,
    };

    switch (options.rework ?? reworks.mar2025) {
        case reworks.jul2026:
            return new Jul2026PpCalculator(calculator_options);
        case reworks.oct2025:
            return new Oct2025PpCalculator(calculator_options);
        case reworks.mar2025:
            return new Mar2025PpCalculator(calculator_options);
        case reworks.oct2024:
            return new Oct2024PpCalculator(calculator_options);
        case reworks.sep2022:
            return new Sep2022PpCalculator(calculator_options);
    }
}

/**
 * Calculates the score for a given beatmap and score data using the specified PP rework and ruleset.
 * @returns The calculated PpCalculatorResult for the score.
 */
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
    Jul2026PpCalculator,
    Mar2025PpCalculator,
    Oct2024PpCalculator,
    Oct2025PpCalculator,
};

export type {
    BeatmapData,
    PpCalculatorResult,
    ProfilePpBreakdown,
    RulesetId,
    ScoreData,
};
