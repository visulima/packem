import type { BannerFooterOption, BannerFooterValue } from "../types";

/**
 * Resolve a {@link BannerFooterOption} down to the concrete value for a single
 * output target. A bare string/function applies to the JavaScript output only;
 * the object form selects the `js` or `dts` branch explicitly.
 */
const resolveBannerFooter = (option: BannerFooterOption | undefined, target: "dts" | "js"): BannerFooterValue | undefined => {
    if (option === undefined) {
        return undefined;
    }

    if (typeof option === "string" || typeof option === "function") {
        // A bare value only targets the JavaScript bundle; declaration files
        // opt in via the object form.
        return target === "js" ? option : undefined;
    }

    return option[target];
};

export default resolveBannerFooter;
