import path from "node:path";

import { createDebug } from "obug";
import ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-resolver");

const tscResolve = (
    id: string,
    importer: string,
    cwd: string,
    tsconfig: string | undefined,
    tsconfigRaw: unknown,
    reference?: ts.ResolvedProjectReference,
): string | undefined => {
    const baseDirectory = tsconfig ? path.dirname(tsconfig) : cwd;
    const parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, ts.sys, baseDirectory);
    const resolved = ts.bundlerModuleNameResolver(id, importer, parsedConfig.options, ts.sys, undefined, reference);

    debug(`tsc resolving id "%s" from "%s" -> %O`, id, importer, resolved.resolvedModule);

    return resolved.resolvedModule?.resolvedFileName;
};

export default tscResolve;
