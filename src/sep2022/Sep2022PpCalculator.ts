import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

/**
 * https://osu.ppy.sh/home/news/2022-09-30-changes-to-osu-sr-and-pp
 *
 * Target: actual pp values (wayback machine)
 */
export default class Sep2022PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "sep2022" as const;
}
