import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

export default class Jul2026PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "jul2026" as const;
}
