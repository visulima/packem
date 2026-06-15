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
    entries,
    fsSystem,
    id,
    parsedConfig,
    tsMacro,
    vue,
}: Pick<TscOptions, "entries" | "vue" | "tsMacro" | "id"> & {
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
    };

    const rootNames = [...new Set([id, ...entries ?? parsedConfig.fileNames].map((f) => fsSystem.resolvePath(f)))];

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

const createTsProgram = ({ context = globalContext, cwd, entries, id, tsconfig, tsconfigRaw, tsMacro, vue }: TscOptions): TscModule => {
    const fsSystem = createFsSystem(context.files);
    const baseDirectory = tsconfig ? dirname(tsconfig) : cwd;
    const parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, fsSystem, baseDirectory);

    debug(`Creating program for root project: ${baseDirectory}`);

    return createTsProgramFromParsedConfig({
        baseDirectory,
        entries,
        fsSystem,
        id,
        parsedConfig,
        tsMacro,
        vue,
    });
};

// Cache the set of root file names per program so membership checks during program
// lookup are O(1) instead of re-allocating the roots array and doing an O(roots) scan
// per candidate, per module load.
const programRootsCache = new WeakMap<ts.Program, Set<string>>();

const getProgramRoots = (program: ts.Program): Set<string> => {
    let roots = programRootsCache.get(program);

    if (!roots) {
        roots = new Set(program.getRootFileNames());
        programRootsCache.set(program, roots);
    }

    return roots;
};

const createOrGetTsModule = (options: TscOptions): TscModule => {
    const { context = globalContext, entries, id } = options;
    const existingProgram = context.programs.find((candidate) => {
        const roots = getProgramRoots(candidate);

        if (entries) {
            return entries.every((entry) => roots.has(entry));
        }

        return roots.has(id);
    });

    if (existingProgram) {
        const sourceFile = existingProgram.getSourceFile(id);

        if (sourceFile) {
            return { file: sourceFile, program: existingProgram };
        }
    }

    debug(`create program for module: ${id}`);
    const module = createTsProgram(options);

    debug(`created program for module: ${id}`);

    context.programs.push(module.program);

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
