import path from "node:path";

import Debug from "debug";
import type { TsConfigJson } from "get-tsconfig";
import type { SourceMapInput } from "rollup";
import ts from "typescript";

import { createFsSystem, createMemorySystem } from "./system.js";
import { createVueProgramFactory } from "./vue.js";

export interface TscContext {
    files: Map<string, string>;
    programs: ts.Program[];
}

export interface TscModule {
    file: ts.SourceFile;
    program: ts.Program;
}

export interface TscOptions {
    context?: TscContext;
    cwd: string;
    entries?: string[];
    id: string;
    incremental: boolean;
    tsconfig?: string;
    tsconfigRaw: TsConfigJson;
    vue?: boolean;
}

const debug = Debug("rollup-plugin-dts:tsc");

debug(`loaded typescript: ${ts.version}`);

export function createContext(): TscContext {
    const programs: ts.Program[] = [];
    const files = new Map<string, string>();

    return { files, programs };
}

const globalContext: TscContext = createContext();

const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: ts.sys.useCaseSensitiveFileNames
        ? (f) => f
        : (f) => f.toLowerCase(),
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getNewLine: () => ts.sys.newLine,
};

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

/**
 * Build the root project and all its dependencies projects.
 * This is designed for a project (e.g. tsconfig.json) that has "references" to
 * other composite projects (e.g., tsconfig.node.json and tsconfig.app.json).
 * If `incremental` is `true`, the build result will be cached in the
 * `.tsbuildinfo` file so that the next time the project is built (without
 * changes) the build will be super fast. If `incremental` is `false`, the
 * `.tsbuildinfo` file will only be written to the memory.
 */
function buildSolution(
    tsconfig: string,
    incremental: boolean,
    context: TscContext,
) {
    debug(`building projects for ${tsconfig} with incremental: ${incremental}`);
    const system = (incremental ? createFsSystem : createMemorySystem)(
        context.files,
    );

    const host = ts.createSolutionBuilderHost(system);
    const builder = ts.createSolutionBuilder(host, [tsconfig], {
    // If `incremental` is `false`, we want to force the builder to rebuild the
    // project even if the project is already built (i.e., `.tsbuildinfo` exists
    // on the disk).
        force: !incremental,
        verbose: true,
    });

    const exitStatus = builder.build();

    debug(`built solution for ${tsconfig} with exit status ${exitStatus}`);
}

function createTsProgram({
    context = globalContext,
    cwd,
    entries,
    id,
    incremental,
    tsconfig,
    tsconfigRaw,
    vue,
}: TscOptions): TscModule {
    const fsSystem = createFsSystem(context.files);
    const parsedCmd = ts.parseJsonConfigFileContent(
        tsconfigRaw,
        fsSystem,
        tsconfig ? path.dirname(tsconfig) : cwd,
    );

    // If the tsconfig has project references, build the project tree.
    if (tsconfig && parsedCmd.projectReferences?.length) {
        buildSolution(tsconfig, incremental, context);
    }

    const compilerOptions: ts.CompilerOptions = {
        ...defaultCompilerOptions,
        ...parsedCmd.options,
    };
    const rootNames = [
        ...new Set(
            [id, ...entries || parsedCmd.fileNames].map((f) =>
                fsSystem.resolvePath(f),
            ),
        ),
    ];

    const host = ts.createCompilerHost(compilerOptions, true);

    // Try to read files from memory first, which was added by `buildSolution`
    host.readFile = fsSystem.readFile;
    host.fileExists = fsSystem.fileExists;
    host.directoryExists = fsSystem.directoryExists;

    const createProgram = vue ? createVueProgramFactory(ts) : ts.createProgram;
    const program = createProgram({
        host,
        options: compilerOptions,
        projectReferences: parsedCmd.projectReferences,
        rootNames,
    });

    const sourceFile = program.getSourceFile(id);

    if (!sourceFile) {
        debug(`source file not found in program: ${id}`);

        if (fsSystem.fileExists(id)) {
            debug(`File ${id} exists on disk.`);
            throw new Error(
                `Unable to load file ${id} from the program. This seems like a bug of rollup-plugin-dts. Please report this issue to https://github.com/sxzz/rollup-plugin-dts/issues`,
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

export interface TscResult {
    code?: string;
    error?: string;
    map?: SourceMapInput;
}

export function tscEmit(tscOptions: TscOptions): TscResult {
    debug(`running tscEmit ${tscOptions.id}`);
    const module = createOrGetTsModule(tscOptions);
    const { file, program } = module;

    debug(`got source file: ${file.fileName}`);
    let dtsCode: string | undefined;
    let map: SourceMapInput | undefined;
    const { diagnostics, emitSkipped } = program.emit(
        file,
        (fileName, code) => {
            if (fileName.endsWith(".map")) {
                debug(`emit dts sourcemap: ${fileName}`);
                map = JSON.parse(code);
            } else {
                debug(`emit dts: ${fileName}`);
                dtsCode = code;
            }
        },
        undefined,
        true,
        undefined,
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
