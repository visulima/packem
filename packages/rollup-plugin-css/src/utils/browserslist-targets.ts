import type { Targets } from "lightningcss";
import { browserslistToTargets } from "lightningcss";

// browserTargets is constant for the whole build, yet browserslistToTargets is
// called per processed file (loader) and per emitted asset (minifier). Memoize
// the resulting targets object keyed by the joined targets list so it is
// computed once and reused.
const targetsCache = new Map<string, Targets>();

/**
 * Converts a browserslist query result to LightningCSS targets, memoized by the
 * joined target list so repeated calls with the same `browserTargets` reuse the
 * previously computed object.
 * @param browserTargets browserslist query result (list of UA strings).
 * @returns LightningCSS `Targets` object.
 */
const browserslistToTargetsCached = (browserTargets: string[]): Targets => {
    const key = browserTargets.join(",");

    let targets = targetsCache.get(key);

    if (!targets) {
        targets = browserslistToTargets(browserTargets);
        targetsCache.set(key, targets);
    }

    return targets;
};

export default browserslistToTargetsCached;
