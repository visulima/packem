/** @deprecated Import from `some-other-package` instead. */
export { legacyHelper } from "./lib";

/** @deprecated Use `NewOptions` instead. */
export type { LegacyOptions } from "./lib";

export {
    /** @deprecated Written inside the braces. */
    renamedHelper as aliasedHelper,
} from "./lib";

/** @deprecated The whole namespace is going away. */
export * as helpers from "./types";

/** @deprecated Re-exported from an external package. */
export type { Plugin } from "rollup";

/** @deprecated Also from the same external package. */
export type { RollupOptions } from "rollup";

/** Doc written on the declaration itself. */
export type { DocumentedOptions } from "./lib";

const localHelper = (): number => 4;

/** @deprecated A local binding exported through a specifier. */
export { localHelper };

/** Control: this one is on a declaration. */
export const keptHelper = (): number => 5;
