import path from "node:path";

import Debug from "debug";
import type { ExistingRawSourceMap } from "rolldown";
import ts from "typescript";

import { globalContext } from "./context.ts";
import { createFsSystem } from "./system.ts";
import type { TscModule, TscOptions, TscResult } from "./types.ts";
import { customTransformers, formatHost, setSourceMapRoot } from "./utils.ts";
import { createProgramFactory } from "./volar.ts";

const debug = Debug("rolldown-plugin-dts:tsc-compiler");

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

function createOrGetTsModule(options: TscOptions): TscModule {
    const { context = globalContext, entries, id } = options;
    const program = context.programs.find((program) => {
        const roots = program.getRootFileNames();

        if (entries) {
            return entries.every((entry) => roots.includes(entry));
        }

        return roots.includes(id);
    });

    if (program) {
        const sourceFile = program.getSourceFile(id);

        if (sourceFile) {
            return { file: sourceFile, program };
        }
    }

    debug(`create program for module: ${id}`);
    const module = createTsProgram(options);

    debug(`created program for module: ${id}`);

    context.programs.push(module.program);

    return module;
}

function createTsProgram({ context = globalContext, cwd, entries, id, tsconfig, tsconfigRaw, tsMacro, vue }: TscOptions): TscModule {
    const fsSystem = createFsSystem(context.files);
    const baseDir = tsconfig ? path.dirname(tsconfig) : cwd;
    const parsedConfig = ts.parseJsonConfigFileContent(tsconfigRaw, fsSystem, baseDir);

    debug(`Creating program for root project: ${baseDir}`);

    return createTsProgramFromParsedConfig({
        baseDir,
        entries,
        fsSystem,
        id,
        parsedConfig,
        tsMacro,
        vue,
    });
}

function createTsProgramFromParsedConfig({
    baseDir,
    entries,
    fsSystem,
    id,
    parsedConfig,
    tsMacro,
    vue,
}: Pick<TscOptions, "entries" | "vue" | "tsMacro" | "id"> & {
    baseDir: string;
    fsSystem: ts.System;
    parsedConfig: ts.ParsedCommandLine;
}): TscModule {
    const compilerOptions: ts.CompilerOptions = {
        ...defaultCompilerOptions,
        ...parsedConfig.options,
        $configRaw: parsedConfig.raw,
        $rootDir: baseDir,
    };

    const rootNames = [...new Set([id, ...entries || parsedConfig.fileNames].map((f) => fsSystem.resolvePath(f)))];

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
                `[rolldown-plugin-dts] Unable to load ${id}; You have "references" in your tsconfig file. Perhaps you want to add \`dts: { build: true }\` in your config?`,
            );
        }

        if (fsSystem.fileExists(id)) {
            debug(`File ${id} exists on disk.`);
            throw new Error(
                `Unable to load file ${id} from the program. This seems like a bug of rolldown-plugin-dts. Please report this issue to https://github.com/sxzz/rolldown-plugin-dts/issues`,
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
}

// Emit file using `tsc` mode (without `--build` flag).
export function tscEmitCompiler(tscOptions: TscOptions): TscResult {
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
                map = JSON.parse(code);
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

    if (emitSkipped && diagnostics.length > 0) {
        return { error: ts.formatDiagnostics(diagnostics, formatHost) };
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
}
