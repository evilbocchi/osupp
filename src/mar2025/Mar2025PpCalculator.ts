import type { BeatmapData, ScoreData } from "../BeatmapData";
import PpCalculator from "../PpCalculator";
import type { OsuRework } from "./AimSkill";
import { calculate_difficulty } from "./DifficultyCalculator";
import { calculate_performance } from "./PerformanceCalculator";

export default class Mar2025PpCalculator extends PpCalculator {
    protected readonly rework: OsuRework = "mar2025";

    protected calculate_performance(score: ScoreData, beatmap: BeatmapData) {
        const stats = score.statistics as Record<string, number | undefined>;
        const source_score = score as ScoreData & { combo?: number };
        const mods = (score.mods ?? []).map((mod) =>
            mod.acronym === "NC" ? "DT" : mod.acronym,
        );
        const difficulty = calculate_difficulty(beatmap, mods, this.rework);

        return {
            performance: calculate_performance(
                difficulty,
                {
                    mods,
                    accuracy: (score.accuracy ?? 0) / 100,
                    combo: source_score.combo ?? score.max_combo ?? 0,
                    statistics: {
                        great: stats.great ?? 0,
                        ok: stats.ok ?? 0,
                        meh: stats.meh ?? 0,
                        miss: stats.miss ?? 0,
                        large_tick_miss: stats.large_tick_miss ?? 0,
                        slider_tail_hit:
                            stats.slider_tail_hit ??
                            difficulty.slider_count -
                                (stats.slider_tail_miss ?? 0),
                    },
                    classic: Boolean(score.legacy_total_score),
                },
                this.rework,
            ),
            difficulty: {
                ...difficulty,
                approach_rate: difficulty.effective_ar,
            },
        };
    }
}
