import Debug from "debug";
import type { ExistingRawSourceMap } from "rollup";
import ts from "typescript";

import type { ParsedProject, SourceFileToProjectMap, TscContext } from "./context.js";
import { globalContext } from "./context.js";
import { createFsSystem, createMemorySystem } from "./system.js";
import type { TscOptions, TscResult } from "./types.js";
import { customTransformers, formatHost, setSourceMapRoot } from "./utils.js";

const debug = Debug("rollup-plugin-dts:tsc-build");

const getOrBuildProjects = (context: TscContext, fsSystem: ts.System, tsconfig: string, force: boolean, sourcemap: boolean): SourceFileToProjectMap => {
    let projectMap = context.projects.get(tsconfig);

    if (projectMap) {
        debug(`skip building projects for ${tsconfig}`);

        return projectMap;
    }

    projectMap = buildProjects(fsSystem, tsconfig, force, sourcemap);
    context.projects.set(tsconfig, projectMap);

    return projectMap;
};

/**
 * Use TypeScript compiler to build all projects referenced
 */
const buildProjects = (fsSystem: ts.System, tsconfig: string, force: boolean, sourcemap: boolean): SourceFileToProjectMap => {
    debug(`start building projects for ${tsconfig}`);

    // Collect all projects from the tsconfig file and its references. A project
    // is a string that represents the path to the project's `tsconfig` file.
    const projects = collectProjectGraph(tsconfig, fsSystem, force, sourcemap);

    debug(
        "collected %d projects: %j",
        projects.length,
        projects.map((project) => project.tsconfigPath),
    );

    const host = ts.createSolutionBuilderHost(fsSystem, createProgramWithPatchedCompilerOptions);
    const builder = ts.createSolutionBuilder(host, [tsconfig], {
        force,
        verbose: true,
    });

    const exitStatus = builder.build(undefined, undefined, undefined, (project) => {
        debug(`transforming project ${project}`);

        return customTransformers;
    });

    debug(`built solution for ${tsconfig} with exit status ${exitStatus}`);

    const sourceFileToProjectMap: SourceFileToProjectMap = new Map();

    for (const project of projects) {
        for (const fileName of project.parsedConfig.fileNames) {
            sourceFileToProjectMap.set(fsSystem.resolvePath(fileName), project);
        }
    }

    return sourceFileToProjectMap;
};

/**
 * Collects all referenced projects from the given entry tsconfig file.
 */
const collectProjectGraph = (rootTsconfigPath: string, fsSystem: ts.System, force: boolean, sourcemap: boolean): ParsedProject[] => {
    const seen = new Set<string>();
    const projects: ParsedProject[] = [];
    const stack = [fsSystem.resolvePath(rootTsconfigPath)];

    while (true) {
        const tsconfigPath = stack.pop();

        if (!tsconfigPath)
            break;

        if (seen.has(tsconfigPath))
            continue;

        seen.add(tsconfigPath);

        const parsedConfig = parseTsconfig(tsconfigPath, fsSystem);

        if (!parsedConfig)
            continue;

        parsedConfig.options = patchCompilerOptions(parsedConfig.options, {
            force,
            sourcemap,
            tsconfigPath,
        });

        projects.push({ parsedConfig, tsconfigPath });

        for (const reference of parsedConfig.projectReferences ?? []) {
            stack.push(ts.resolveProjectReferencePath(reference));
        }
    }

    return projects;
};

const parseTsconfig = (tsconfigPath: string, fsSystem: ts.System): ts.ParsedCommandLine | undefined => {
    const diagnostics: ts.Diagnostic[] = [];

    const parsedConfig = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, {
        ...fsSystem,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            diagnostics.push(diagnostic);
        },
    });

    if (diagnostics.length > 0) {
        throw new Error(`[rollup-plugin-dts] Unable to read ${tsconfigPath}: ${ts.formatDiagnostics(diagnostics, formatHost)}`);
    }

    return parsedConfig;
};

// To ensure we can get `.d.ts` and `.d.ts.map` files from `tsc --build` mode,
// we need to enforce certain compiler options. Notice that changing compiler
// options will invalidate the cache, so it's better to set the correct value in
// tsconfig files in the first place. Therefore, we print some warnings if the
// values are not set correctly.
const patchCompilerOptions = (
    options: ts.CompilerOptions,
    extraOptions: {
        force: boolean;
        sourcemap: boolean;
        tsconfigPath: string;
    } | null,
): ts.CompilerOptions => {
    const noEmit: boolean = options.noEmit ?? false;
    const declaration: boolean = options.declaration ?? !!options.composite;
    const declarationMap: boolean = options.declarationMap ?? false;

    const shouldPrintWarning = extraOptions?.tsconfigPath && !extraOptions.force;

    if (noEmit === true) {
        options = { ...options, noEmit: false };

        if (shouldPrintWarning) {
            console.warn(`[rollup-plugin-dts] ${extraOptions.tsconfigPath} has "noEmit" set to true. Please set it to false to generate declaration files.`);
        }
    }

    if (declaration === false) {
        options = { ...options, declaration: true };

        if (shouldPrintWarning) {
            console.warn(
                `[rollup-plugin-dts] ${extraOptions.tsconfigPath} has "declaration" set to false. Please set it to true to generate declaration files.`,
            );
        }
    }

    if (declarationMap === false && extraOptions?.sourcemap) {
        options = { ...options, declarationMap: true };

        if (shouldPrintWarning) {
            console.warn(
                `[rollup-plugin-dts] ${extraOptions.tsconfigPath} has "declarationMap" set to false. Please set it to true if you want to generate source maps for declaration files.`,
            );
        }
    }

    return options;
};

const createProgramWithPatchedCompilerOptions: ts.CreateProgram<ts.EmitAndSemanticDiagnosticsBuilderProgram> = (rootNames, options, ...arguments_) =>
    ts.createEmitAndSemanticDiagnosticsBuilderProgram(rootNames, patchCompilerOptions(options ?? {}, null), ...arguments_);

// Emit file using `tsc --build` mode.
export const tscEmitBuild = (tscOptions: TscOptions): TscResult => {
    const { context = globalContext, id, incremental, sourcemap, tsconfig } = tscOptions;

    debug(`running tscEmitBuild id: ${id}, tsconfig: ${tsconfig}, incremental: ${incremental}`);

    if (!tsconfig) {
        return {
            error: "[rollup-plugin-dts] build mode requires a tsconfig path",
        };
    }

    const fsSystem = (incremental ? createFsSystem : createMemorySystem)(context.files);

    const resolvedId = fsSystem.resolvePath(id);

    if (resolvedId !== id) {
        debug(`resolved id from ${id} to ${resolvedId}`);
    }

    // Build projects (if necessary) and collect all projects.
    const sourceFileToProjectMap = getOrBuildProjects(context, fsSystem, tsconfig, !incremental, sourcemap);

    const project = sourceFileToProjectMap.get(resolvedId);

    if (!project) {
        debug(`unable to locate a project containing ${resolvedId}`);

        return {
            error: `Unable to locate ${id} from the given tsconfig file ${tsconfig}`,
        };
    }

    debug(`loaded project ${project.tsconfigPath} for ${id}`);

    const ignoreCase = !fsSystem.useCaseSensitiveFileNames;
    const outputFiles = ts.getOutputFileNames(project.parsedConfig, resolvedId, ignoreCase);

    let code: string | undefined;
    let map: ExistingRawSourceMap | undefined;

    for (const outputFile of outputFiles) {
        if (outputFile.endsWith(".d.ts")) {
            if (!fsSystem.fileExists(outputFile)) {
                console.warn(`[rollup-plugin-dts] Unable to read file ${outputFile}`);
                continue;
            }

            code = fsSystem.readFile(outputFile);
            continue;
        }

        if (outputFile.endsWith(".d.ts.map")) {
            if (!fsSystem.fileExists(outputFile)) {
                continue;
            }

            const text = fsSystem.readFile(outputFile);

            if (!text) {
                console.warn(`[rollup-plugin-dts] Unexpected sourcemap ${outputFile}`);
                continue;
            }

            map = JSON.parse(text);
            setSourceMapRoot(map, outputFile, resolvedId);
        }
    }

    if (code) {
        return { code, map };
    }

    if (incremental) {
        debug(`incremental build failed`);

        // Fallback to non-incremental (force) build.
        //
        // This can happen if users delete the emitted files from `tsc --build`, but
        // still keep the `.tsbuildinfo` file exist. In this case, `tsc --build`
        // will skip the build, but the `.d.ts` file we need doesn't actually exist.
        return tscEmitBuild({ ...tscOptions, incremental: false });
    }

    debug(`unable to build .d.ts file for ${id}`);

    // Try to locate the cause of the failure and provide a helpful error message
    if (project.parsedConfig.options.declaration !== true) {
        return {
            error: `Unable to build .d.ts file for ${id}; Make sure the "declaration" option is set to true in ${project.tsconfigPath}`,
        };
    }

    return {
        error: `Unable to build .d.ts file for ${id}; This seems like a bug of rollup-plugin-dts. Please report this issue to https://github.com/sxzz/rollup-plugin-dts/issues`,
    };
};
