import { dirname } from "@visulima/path";
import type { TsConfigJson } from "@visulima/tsconfig";
import Debug from "debug";
import type { SourceMapInput } from "rollup";
import ts from "typescript";

import type { TscContext } from "./context";
import { globalContext } from "./context";
import { createFsSystem, createMemorySystem } from "./system";
import { createVueProgramFactory } from "./vue";

export interface TscModule {
    file: ts.SourceFile;
    program: ts.Program;
}

export interface TscOptions {
    build: boolean;
    context?: TscContext;
    cwd: string;
    entries?: string[];
    id: string;
    incremental: boolean;
    tsconfig?: string;
    tsconfigRaw: TsConfigJson;
    vue?: boolean;
}

const debug = Debug("rolldown-plugin-dts:tsc");

debug(`loaded typescript: ${ts.version}`);

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

    // Collect all projects in the solution using the `getCustomTransformers`
    // callback. This doesn't seem to be the intended use of the callback, but
    // it's an easy way to collect all projects at any nesting level without the
    // need to implement the traversing logic ourselves.
    //
    // A project is a string that represents the path to the project's `tsconfig`
    // file.
    const projects: string[] = [];
    const getCustomTransformers = (project: string): ts.CustomTransformers => {
        projects.push(project);

        return {};
    };

    const exitStatus = builder.build(
        undefined,
        undefined,
        undefined,
        getCustomTransformers,
    );

    debug(`built solution for ${tsconfig} with exit status ${exitStatus}`);

    return [...new Set(projects)];
}

function parseTsconfig(
    tsconfigPath: string,
    fsSystem: ts.System,
): ts.ParsedCommandLine | undefined {
    const diagnostics: ts.Diagnostic[] = [];

    const parsedConfig = ts.getParsedCommandLineOfConfigFile(
        tsconfigPath,
        undefined,
        {
            ...fsSystem,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                diagnostics.push(diagnostic);
            },
        },
    );

    if (diagnostics.length > 0) {
        throw new Error(
            `[rolldown-plugin-dts] Unable to read ${tsconfigPath}: ${ts.formatDiagnostics(diagnostics, formatHost)}`,
        );
    }

    return parsedConfig;
}

function createTsProgram({
    build,
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
    const baseDir = tsconfig ? dirname(tsconfig) : cwd;
    const parsedConfig = ts.parseJsonConfigFileContent(
        tsconfigRaw,
        fsSystem,
        baseDir,
    );

    // If the tsconfig has project references, build the project tree.
    if (tsconfig && build) {
        // Build the project tree and collect all projects.
        // Step 1: Run the solution build to populate in-memory .d.ts for references.
        const projectPaths = buildSolution(tsconfig, incremental, context);

        debug(`collected projects: ${JSON.stringify(projectPaths)}`);

        // Step 2: Aggregate all original source files from all referenced projects
        // into a single list to build one comprehensive Program.
        const allFileNames = new Set<string>(
            parsedConfig.fileNames.map((f) => fsSystem.resolvePath(f)),
        );

        for (const projectPath of projectPaths) {
            const projectConfig = parseTsconfig(projectPath, fsSystem);

            if (projectConfig) {
                for (const fileName of projectConfig.fileNames) {
                    allFileNames.add(fsSystem.resolvePath(fileName));
                }
            }
        }

        // Ensure the current entry and any explicitly passed entries are included.
        allFileNames.add(fsSystem.resolvePath(id));

        if (entries) {
            for (const entry of entries) {
                allFileNames.add(fsSystem.resolvePath(entry));
            }
        }

        // Step 3: Create a new parsed config that includes ALL source files.
        const combinedParsedConfig: ts.ParsedCommandLine = {
            ...parsedConfig,
            fileNames: [...allFileNames],
            projectReferences: undefined,
        };

        debug(
            `Creating a single comprehensive program with ${combinedParsedConfig.fileNames.length} files.`,
        );

        // Step 4: Create the program from this complete configuration.
        return createTsProgramFromParsedConfig({
            baseDir, // Base directory should still be from the root tsconfig
            entries: undefined,
            fsSystem,
            id,
            parsedConfig: combinedParsedConfig,
            vue,
        });
    }

    // If the tsconfig doesn't have project references, create a single program
    // for the root project.
    return createTsProgramFromParsedConfig({
        baseDir,
        entries,
        fsSystem,
        id,
        parsedConfig,
        vue,
    });
}

function createTsProgramFromParsedConfig({
    baseDir,
    entries,
    fsSystem,
    id,
    parsedConfig,
    vue,
}: Pick<TscOptions, "entries" | "vue" | "id"> & {
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

    // When creating a single, comprehensive program from multiple project references,
    // the `outDir`, `declarationDir`, and `rootDir` options from the original tsconfigs
    // become misleading and must be removed to ensure correct sourcemap paths.
    //
    // - `outDir` / `declarationDir`: These cause TSC to generate incorrect relative
    //   paths in sourcemaps because the plugin, not TSC, controls the final output
    //   location. For example, TSC might calculate paths relative to a `build/`
    //   directory while the plugin saves the output to `dist/`. Removing them forces
    //   TSC to calculate paths as if the output were co-located with the sources,
    //   producing correct and portable paths.
    //
    // - `rootDir`: This is removed to allow TSC to correctly infer the common
    //   root directory from the complete, aggregated set of input files. This ensures
    //   the most stable and correct relative paths, regardless of the original
    //   project structure.
    delete compilerOptions.rootDir;
    delete compilerOptions.outDir;
    delete compilerOptions.declarationDir;

    const rootNames = [
        ...new Set(
            [id, ...entries || parsedConfig.fileNames].map((f) =>
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
        projectReferences: parsedConfig.projectReferences,
        rootNames,
    });

    const sourceFile = program.getSourceFile(id);

    if (!sourceFile) {
        debug(`source file not found in program: ${id}`);

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

    // fix #77
    const stripPrivateFields: ts.TransformerFactory<ts.SourceFile> = (context) => {
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

        return (sourceFile) =>
            ts.visitNode(sourceFile, visitor, ts.isSourceFile) ?? sourceFile;
    };

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
        { afterDeclarations: [stripPrivateFields] },
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
