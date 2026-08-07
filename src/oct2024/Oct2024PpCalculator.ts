import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

/**
 * https://osu.ppy.sh/home/news/2024-10-28-performance-points-star-rating-updates
 *
 * Target: huismetbenen pp values
 */
export default class Oct2024PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "oct2024" as const;
}
