import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsOxcTransformer = (id: string, code: string, sourceMap?: boolean): IsolatedDeclarationsResult => {
    const result = isolatedDeclaration(id, code, { sourcemap: sourceMap });

    return {
        errors: result.errors.map((error) => error.message),
        map: result.map?.mappings,
        sourceText: result.code,
    };
};

export default isolatedDeclarationsOxcTransformer;
