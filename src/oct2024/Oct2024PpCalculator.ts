import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

export default class Oct2024PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "oct2024" as const;
}
