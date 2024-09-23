import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsOxcTransformer = (id: string, code: string): IsolatedDeclarationsResult => {
    const result = isolatedDeclaration(id, code, { sourcemap: false });

    return {
        errors: result.errors,
        sourceText: result.code,
    };
};

// eslint-disable-next-line import/no-unused-modules
export default isolatedDeclarationsOxcTransformer;
