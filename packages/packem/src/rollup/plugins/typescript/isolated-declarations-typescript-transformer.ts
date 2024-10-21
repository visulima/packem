import type { TranspileOptions } from "typescript";
import { formatDiagnostics, sys, transpileDeclaration } from "typescript";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsTypescriptTransformer = async (
    id: string,
    code: string,
    transformOptions?: TranspileOptions,
): Promise<IsolatedDeclarationsResult> => {
    const { diagnostics, outputText } = transpileDeclaration(code, {
        fileName: id,
        reportDiagnostics: true,
        ...transformOptions,
    });

    const errors = diagnostics?.length
        ? [
              formatDiagnostics(diagnostics, {
                  getCanonicalFileName: (fileName) => (sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()),
                  getCurrentDirectory: () => sys.getCurrentDirectory(),
                  getNewLine: () => sys.newLine,
              }),
          ]
        : [];

    return {
        errors,
        sourceText: outputText,
    };
};

// eslint-disable-next-line import/no-unused-modules
export default isolatedDeclarationsTypescriptTransformer;
