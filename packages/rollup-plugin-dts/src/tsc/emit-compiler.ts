import { dirname } from "@visulima/path";
import { createDebug } from "obug";
import type { ExistingRawSourceMap } from "rollup";
import ts from "typescript";

import { globalContext } from "./context.js";
import { createFsSystem } from "./system.js";
import type { TscModule, TscOptions, TscResult } from "./types.js";
import { customTransformers, formatHost, setSourceMapRoot } from "./utils.js";
import createProgramFactory from "./volar.js";

const debug = createDebug("rollup-plugin-dts:tsc-compiler");

const defaultCompilerOptions: ts.CompilerOptions = {
    checkJs: false,
    declaration: true,
    declarationMap: false,
    emitDeclarationOnly: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: false,
    noEmitOnError: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    target: 99 satisfies ts.ScriptTarget.ESNext,
};

const createTsProgramFromParsedConfig = ({
    baseDirectory,
    fsSystem,
    id,
    parsedConfig,
    tsMacro,
    vue,
}: Pick<TscOptions, "vue" | "tsMacro" | "id"> & {
    baseDirectory: string;
    fsSystem: ts.System;
    parsedConfig: ts.ParsedCommandLine;
}): TscModule => {
    const compilerOptions: ts.CompilerOptions = {
        ...defaultCompilerOptions,
        ...parsedConfig.options,
        // @ts-expect-error TypeScript-only fields are not in ts.CompilerOptions typing
        $configRaw: parsedConfig.raw as unknown,
        $rootDir: baseDirectory,
        // Generating `.d.ts` is the entire purpose of this path, so a user
        // `declaration: false` (carried in via `parsedConfig.options`) must never win.
        // Beyond skipping emit, `declaration: false` combined with `declarationMap: true`
        // (which `resolveOptions` sets whenever `dts.sourcemap` is on) makes tsc crash
        // with a bare "Debug Failure" in `getSourceMappingURL`. Mirror the build path's
        // `patchCompilerOptions` guard. See sxzz/rolldown-plugin-dts#254.
        declaration: true,
        emitDeclarationOnly: true,
        // Allow non-TS extensions (e.g. `.vue`) to be used as root files. Without this,
        // TypeScript silently drops root files whose extension is not in its built-in
        // supported list, so `program.getSourceFile(id)` returns `undefined` for a `.vue`
        // entry that no `.ts` file imports. Only relevant when a language plugin
        // (Vue/ts-macro) registers such extensions; module resolution already handles the
        // imported-file case. See sxzz/rolldown-plugin-dts#272.
        ...vue || tsMacro ? { allowNonTsExtensions: true } : undefined,
    };

    // Root the program at only this module. TypeScript still pulls in everything `id`
    // transitively imports, which is all that emitting `id`'s declaration requires. Rooting at
    // every build entry (the previous `[id, ...entries]`) made one shared program full-type-check
    // the union of all entries at once, so peak memory scaled with total entry count and OOM'd on
    // many-entry packages (visulima/packem#216).
    const rootNames = [fsSystem.resolvePath(id)];

    const host = ts.createCompilerHost(compilerOptions, true);

    const createProgram = createProgramFactory(ts, { tsMacro, vue });
    const program = createProgram({
        host,
        options: compilerOptions,
        projectReferences: parsedConfig.projectReferences,
        rootNames,
    });

    const sourceFile = program.getSourceFile(id);

    if (!sourceFile) {
        debug(`source file not found in program: ${id}`);

        const hasReferences = !!parsedConfig.projectReferences?.length;

        if (hasReferences) {
            throw new Error(
                `[rollup-plugin-dts] Unable to load ${id}; You have "references" in your tsconfig file. Perhaps you want to add \`dts: { build: true }\` in your config?`,
            );
        }

        if (fsSystem.fileExists(id)) {
            debug(`File ${id} exists on disk.`);
            throw new Error(
                `Unable to load file ${id} from the program. This seems like a bug of rollup-plugin-dts. Please report this issue to https://github.com/visulima/packem/issues`,
            );
        } else {
            debug(`File ${id} does not exist on disk.`);
            throw new Error(`Source file not found: ${id}`);
        }
    }

    return {
        file: sourceFile,
        program,
    };
};

const createTsProgram = ({ context = globalContext, cwd, id, tsconfig, tsconfigRaw, tsMacro, vue }: TscOptions): TscModule => {
    const fsSystem = createFsSystem(context.files);
    const baseDirectory = tsconfig ? dirname(tsconfig) : cwd;
    const parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, fsSystem, baseDirectory);

    debug(`Creating program for root project: ${baseDirectory}`);

    return createTsProgramFromParsedConfig({
        baseDirectory,
        fsSystem,
        id,
        parsedConfig,
        tsMacro,
        vue,
    });
};

// Cap on retained programs. Rooting each program at a single module (see
// `createTsProgramFromParsedConfig`) keeps peak memory proportional to a few entry closures
// rather than the whole entry set, but retaining one program per entry would still accumulate on a
// package with dozens of independent entries — each program holds its own copy of the default
// library. Evict the oldest beyond this window; a later module that needed an evicted program
// simply rebuilds it (correct, only recomputed). Exported for the many-entry regression test.
// eslint-disable-next-line import/exports-last -- co-located with the retention logic it caps
export const MAX_RETAINED_PROGRAMS = 8;

const createOrGetTsModule = (options: TscOptions): TscModule => {
    const { context = globalContext, id } = options;

    // Reuse any retained program that already contains `id` as a source file — whether `id` is
    // that program's own root or a module pulled into a sibling entry's import closure. This
    // recovers cross-entry sharing without rooting every program at all entries (which made one
    // shared program full-type-check the whole entry set and OOM on many-entry packages, #216).
    for (const candidate of context.programs) {
        const sourceFile = candidate.getSourceFile(id);

        if (sourceFile) {
            return { file: sourceFile, program: candidate };
        }
    }

    debug(`create program for module: ${id}`);
    const module = createTsProgram(options);

    debug(`created program for module: ${id}`);

    context.programs.push(module.program);

    // Bound retention so many-entry builds don't accumulate one program per entry.
    while (context.programs.length > MAX_RETAINED_PROGRAMS) {
        context.programs.shift();
    }

    return module;
};

// Emit file using `tsc` mode (without `--build` flag).
const tscEmitCompiler = (tscOptions: TscOptions): TscResult => {
    debug(`running tscEmitCompiler ${tscOptions.id}`);

    const module = createOrGetTsModule(tscOptions);
    const { file, program } = module;

    debug(`got source file: ${file.fileName}`);
    let dtsCode: string | undefined;
    let map: ExistingRawSourceMap | undefined;

    const { diagnostics, emitSkipped } = program.emit(
        file,
        (fileName, code) => {
            if (fileName.endsWith(".map")) {
                debug(`emit dts sourcemap: ${fileName}`);
                map = JSON.parse(code) as ExistingRawSourceMap;
                setSourceMapRoot(map, fileName, tscOptions.id);
            } else {
                debug(`emit dts: ${fileName}`);
                dtsCode = code;
            }
        },
        undefined,
        true,
        customTransformers,
        // @ts-expect-error private API: forceDtsEmit
        true,
    );

    // Only surface genuine errors — `Warning`/`Message`/`Suggestion` diagnostics must not
    // fail the build (partial fix for sxzz/rolldown-plugin-dts#92). Note: declarations are
    // emitted with `forceDtsEmit`, so pre-emit type errors (e.g. an externalized dependency
    // that tsc can't resolve during dts generation) are intentionally NOT propagated here —
    // doing so would defeat the forced-emit design this plugin relies on.
    if (emitSkipped) {
        const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

        if (errors.length > 0) {
            return { error: ts.formatDiagnostics(errors, formatHost) };
        }
    }

    // If TypeScript skipped emitting because the file is already a .d.ts (e.g. a
    // redirected output from a composite project build), the emit callback above
    // will never be invoked. In that case, fall back to the text of the source
    // file itself so that callers still receive a declaration string.
    if (!dtsCode && file.isDeclarationFile) {
        debug("nothing was emitted. fallback to sourceFile text.");
        dtsCode = file.getFullText();
    }

    return { code: dtsCode, map };
};

export default tscEmitCompiler;
