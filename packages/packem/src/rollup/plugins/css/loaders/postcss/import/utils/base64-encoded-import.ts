import type { Condition } from "../types";
import formatImportPrelude from "./format-import-prelude";

// Base64 encode an import with conditions
// The order of conditions is important and is interleaved with cascade layer declarations
// Each group of conditions and cascade layers needs to be interpreted in order
// To achieve this we create a list of base64 encoded imports, where each import contains a stylesheet with another import.
// Each import can define a single group of conditions and a single cascade layer.
const base64EncodedConditionalImport = (prelude: string, conditions: Condition[]): string => {
    conditions.reverse();

    const first = conditions.pop();

    if (!first) {
        return prelude;
    }

    let parameters = `${prelude} ${formatImportPrelude(first.layer, first.media, first.supports, first.scope)}`;

    for (const condition of conditions) {
        parameters = `'data:text/css;base64,${Buffer.from(`@import ${parameters}`).toString("base64")}' ${formatImportPrelude(
            condition.layer,
            condition.media,
            condition.supports,
            condition.scope
        )}`;
    }

    return parameters;
};

export default base64EncodedConditionalImport;
