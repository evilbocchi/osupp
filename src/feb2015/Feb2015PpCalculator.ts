import type { PpCalculatorOptions } from "../PpCalculator";
import Jul2015PpCalculator from "../jul2015/Jul2015PpCalculator";

/**
 * High AR rebalance
 *
 * No news post found for this rework.
 *
 * Target: huismetbenen pp values.
 */
export default class Feb2015PpCalculator extends Jul2015PpCalculator {
    constructor(options: PpCalculatorOptions = {}) {
        super(options, "feb2015");
    }
}
