import type { IsolatedDeclarationsOptions } from "oxc-transform";
import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../types";

const isolatedDeclarationsOxcTransformer = (id: string, code: string, sourceMap?: boolean, transformOptions?: Omit<IsolatedDeclarationsOptions, "sourcemap">): IsolatedDeclarationsResult => {
    const result = isolatedDeclaration(id, code, { ...transformOptions, sourcemap: sourceMap });

    return {
        errors: result.errors.map((error) => error.message),
        map: result.map?.mappings,
        sourceText: result.code,
    };
};

export default isolatedDeclarationsOxcTransformer;
