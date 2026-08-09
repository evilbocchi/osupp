import type { PpCalculatorOptions } from "../PpCalculator";
import Jul2015PpCalculator from "../jul2015/Jul2015PpCalculator";

export default class Feb2015PpCalculator extends Jul2015PpCalculator {
    constructor(options: PpCalculatorOptions = {}) {
        super(options, "feb2015");
    }
}
