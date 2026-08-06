import Mar2025PpCalculator from "../mar2025/Mar2025PpCalculator";

export default class Sep2022PpCalculator extends Mar2025PpCalculator {
    protected override readonly rework = "sep2022" as const;
}
