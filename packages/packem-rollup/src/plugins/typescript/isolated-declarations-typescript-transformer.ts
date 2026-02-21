import type { CompilerOptions, TranspileOptions } from "typescript";
import { formatDiagnostics, sys, transpileDeclaration } from "typescript";

import type { IsolatedDeclarationsResult } from "../../types";

const stripMapUrl = (code: string) => {
    const lines = code.split("\n");
    const lastLine = lines.at(-1);

    if (lastLine?.startsWith("//# sourceMappingURL=")) {
        return lines.slice(0, -1).join("\n");
    }

    return code;
};

const isolatedDeclarationsTypescriptTransformer = async (
    id: string,
    code: string,
    sourceMap?: boolean,
    transformOptions?: TranspileOptions,
): Promise<IsolatedDeclarationsResult> => {
    const compilerOptions: CompilerOptions = {
        declarationMap: sourceMap,
        ...transformOptions?.compilerOptions,
    };

    // eslint-disable-next-line prefer-const
    let { diagnostics, outputText, sourceMapText } = transpileDeclaration(code, {
        fileName: id,
        reportDiagnostics: true,
        ...transformOptions,
        compilerOptions,
    });

    if (compilerOptions.declarationMap) {
        outputText = stripMapUrl(outputText);
    }

    const errors = diagnostics?.length
        ? [
              formatDiagnostics(diagnostics, {
                  getCanonicalFileName: (fileName) => (sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()),
                  getCurrentDirectory: () => sys.getCurrentDirectory(),
                  getNewLine: () => sys.newLine,
              }),
          ]
        : [];

    if (sourceMapText) {
        sourceMapText = (JSON.parse(sourceMapText as string) as { mappings: string }).mappings;
    }

    return {
        errors,
        map: sourceMapText,
        sourceText: outputText,
    };
};

export default isolatedDeclarationsTypescriptTransformer;
