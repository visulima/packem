import { posix } from "node:path";
import { pathToFileURL } from "node:url";

import type { ExistingRawSourceMap } from "rollup";
import ts from "typescript";

// fix #77
const stripPrivateFields: ts.TransformerFactory<ts.SourceFile | ts.Bundle> = (context) => {
    const visitor = (node: ts.Node) => {
        if (ts.isPropertySignature(node) && ts.isPrivateIdentifier(node.name)) {
            return context.factory.updatePropertySignature(
                node,
                node.modifiers,
                context.factory.createStringLiteral(node.name.text),
                node.questionToken,
                node.type,
            );
        }

        return ts.visitEachChild(node, visitor, context);
    };

    return (sourceFile) => ts.visitNode(sourceFile, visitor, ts.isSourceFile) ?? sourceFile;
};

export const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? (f) => f : (f) => f.toLowerCase(),
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getNewLine: () => ts.sys.newLine,
};

export const customTransformers: ts.CustomTransformers = {
    afterDeclarations: [stripPrivateFields],
};

// Since the output directory of tsc and rollup-plugin-dts might be different,
// we need to explicitly set the `sourceRoot` of the source map so that the
// final sourcemap has correct paths in `sources` field.
export const setSourceMapRoot = (
    map: ExistingRawSourceMap | undefined,
    // The original path of the source map file (e.g. configured by tsconfig.json `outDir` and emitted by tsc)
    originalFilePath: string,
    // The final path of the source map file (e.g. emitted by rollup-plugin-dts)
    finalFilePath: string,
): void => {
    if (!map) {
        return;
    }

    // Don't override the sourceRoot if it's already set.
    if (map.sourceRoot) {
        return;
    }

    const originalDir = posix.dirname(pathToFileURL(originalFilePath).pathname);
    const finalDir = posix.dirname(pathToFileURL(finalFilePath).pathname);

    if (originalDir !== finalDir) {
        map.sourceRoot = posix.relative(finalDir, originalDir);
    }
};
