import { createFilter as _createFilter } from "@rollup/pluginutils";
import type { PackageJson } from "@visulima/package";

type FilterPattern
    = | ReadonlyArray<RegExp | string>
        | RegExp
        | string
        | undefined;

const createFilter = _createFilter as (
    include?: FilterPattern,
    exclude?: FilterPattern,
    options?: { resolve?: string | false | undefined },
) => (id: string | unknown) => boolean;

const getPackageSideEffect = (
    cwd: string,
    packageJson: PackageJson,
): (id: string) => boolean | undefined => {
    const { sideEffects } = packageJson;

    let hasSideEffects: (id: string) => boolean | undefined;

    if (typeof sideEffects === "boolean") {
        hasSideEffects = () => sideEffects;
    } else if (Array.isArray(sideEffects)) {
        if (sideEffects.length <= 0) {
            // createFilter always returns true if `includes` is an empty array
            // but here we want it to always return false
            hasSideEffects = () => false;
        } else {
            const finalPackageSideEffects = sideEffects.map((sideEffect) => {
                /*
                 * The array accepts simple glob patterns to the relevant files... Patterns like *.css, which do not include a /, will be treated like **\/*.css.
                 * https://webpack.js.org/guides/tree-shaking/
                 * https://github.com/vitejs/vite/pull/11807
                 */
                if (sideEffect.includes("/")) {
                    return sideEffect;
                }

                return `**/${sideEffect}`;
            });

            hasSideEffects = createFilter(finalPackageSideEffects, undefined, {
                resolve: cwd,
            });
        }
    } else {
        hasSideEffects = () => undefined;
    }

    return hasSideEffects;
};

export default getPackageSideEffect;
