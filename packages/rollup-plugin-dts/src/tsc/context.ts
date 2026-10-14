import { resolve } from "@visulima/path";
import { createDebug } from "obug";
import type ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-context");

// The program caches of the builds that use languages, keyed by their language fingerprint (see `getLanguageFingerprint`).
const sharedContexts = new Map<string, TscContext>();

// A parsed tsconfig file with its path.
export interface ParsedProject {
    parsedConfig: ts.ParsedCommandLine;
    tsconfigPath: string;
}

// A map of a source file to the project it belongs to. This makes it faster to
// find the project for a source file.
export type SourceFileToProjectMap = Map<string, ParsedProject>;

export interface TscContext {
    files: Map<string, string>;
    programs: ts.Program[];

    // A map of a root tsconfig to all projects referenced from it.
    projects: Map<string, SourceFileToProjectMap>;
}

export const createContext = (): TscContext => {
    const programs: ts.Program[] = [];
    const files = new Map<string, string>();
    const projects = new Map<string, SourceFileToProjectMap>();

    return { files, programs, projects };
};

export const invalidateContextFile = (context: TscContext, file: string): void => {
    const normalizedFile = resolve(file).replaceAll("\\", "/");

    debug(`invalidating context file: ${normalizedFile}`);
    context.files.delete(normalizedFile);
    context.programs = context.programs.filter((program) => program.getSourceFiles().every((sourceFile) => sourceFile.fileName !== normalizedFile));
    context.projects.clear();
};

export const globalContext: TscContext = createContext();

// A build that uses `vue` or a custom language must not reuse a program created for another language set, so each
// language set gets a cache of its own. The empty fingerprint (no languages) keeps `globalContext`.
export const getSharedContext = (fingerprint: string): TscContext => {
    if (fingerprint === "") {
        return globalContext;
    }

    let context = sharedContexts.get(fingerprint);

    if (!context) {
        context = createContext();
        sharedContexts.set(fingerprint, context);
    }

    return context;
};

export const invalidateSharedContextFile = (file: string): void => {
    for (const context of [globalContext, ...sharedContexts.values()]) {
        invalidateContextFile(context, file);
    }
};
