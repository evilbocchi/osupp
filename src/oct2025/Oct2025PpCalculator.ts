import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

/**
 * https://osu.ppy.sh/home/news/2025-10-29-performance-points-star-rating-updates
 *
 * Target: actual pp values (wayback machine)
 */
export default class Oct2025PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "oct2025" as const;
}
