import type { PpCalculatorOptions } from "../PpCalculator";
import Jul2015PpCalculator from "../jul2015/Jul2015PpCalculator";

/**
 * Historical osu! performance calculation from the pp-jan14-feb15 oracle.
 *
 * Target: huismetbenen pp values.
 */
export default class Jan2014PpCalculator extends Jul2015PpCalculator {
    constructor(options: PpCalculatorOptions = {}) {
        super(options, "jan2014");
    }

    protected override readonly approach_rate_bonus_start = 10;
    protected override readonly approach_rate_bonus_multiplier = 0.2;
    protected override readonly flashlight_length_multiplier = 0.36;
}
