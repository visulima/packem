import path from "node:path";

import { createDebug } from "obug";
import ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-resolver");

// `parseJsonConfigFileContent` walks the config, normalizes compiler options and
// re-globs file names — work that is identical for every import in a build. Memoize
// the parsed result so the tsconfig is parsed once per (tsconfigRaw, baseDirectory)
// pair instead of once per resolved import. `tsconfigRaw` is keyed by identity via a
// WeakMap so the cache is collected once the config object is gone, and a nested Map
// disambiguates the rare case of the same raw object resolved against several bases.
const parsedConfigCache = new WeakMap<object, Map<string, ts.ParsedCommandLine>>();

const getParsedConfig = (tsconfigRaw: unknown, baseDirectory: string): ts.ParsedCommandLine => {
    if (typeof tsconfigRaw !== "object" || tsconfigRaw === null) {
        return ts.parseJsonConfigFileContent(tsconfigRaw, ts.sys, baseDirectory);
    }

    let byBase = parsedConfigCache.get(tsconfigRaw);

    if (!byBase) {
        byBase = new Map<string, ts.ParsedCommandLine>();
        parsedConfigCache.set(tsconfigRaw, byBase);
    }

    let parsedConfig = byBase.get(baseDirectory);

    if (!parsedConfig) {
        parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, ts.sys, baseDirectory);
        byBase.set(baseDirectory, parsedConfig);
    }

    return parsedConfig;
};

const tscResolve = (
    id: string,
    importer: string,
    cwd: string,
    tsconfig: string | undefined,
    tsconfigRaw: unknown,
    reference?: ts.ResolvedProjectReference,
): string | undefined => {
    const baseDirectory = tsconfig ? path.dirname(tsconfig) : cwd;
    const parsedConfig = getParsedConfig(tsconfigRaw, baseDirectory);
    const resolved = ts.bundlerModuleNameResolver(id, importer, parsedConfig.options, ts.sys, undefined, reference);

    debug(`tsc resolving id "%s" from "%s" -> %O`, id, importer, resolved.resolvedModule);

    return resolved.resolvedModule?.resolvedFileName;
};

export default tscResolve;
