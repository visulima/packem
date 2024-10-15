import formatImportPrelude from "./format-import-prelude";

const base64EncodedConditionalImport = (prelude: string, conditions): string => {
    conditions.reverse();

    const first = conditions.pop();

    let parameters = `${prelude} ${formatImportPrelude(first.layer, first.media, first.supports)}`;

    for (const condition of conditions) {
        parameters = `'data:text/css;base64,${Buffer.from(`@import ${parameters}`).toString("base64")}' ${formatImportPrelude(
            condition.layer,
            condition.media,
            condition.supports,
        )}`;
    }

    return parameters;
};

export default base64EncodedConditionalImport;
