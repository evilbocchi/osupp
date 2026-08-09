import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

/**
 * Low AR/reading buff, low BPM/spaced jumps buff, repetitive jump nerf, flow aim/speed accuracy rebalance
 *
 * https://osu.ppy.sh/home/news/2026-07-03-performance-points-star-rating-updates
 *
 * Target: actual pp values (wayback machine)
 */
export default class Jul2026PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "jul2026" as const;
}
