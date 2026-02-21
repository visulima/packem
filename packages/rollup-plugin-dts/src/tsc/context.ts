import { resolve } from "@visulima/path";
import { createDebug } from "obug";
import type ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-context");

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
    file = resolve(file).replaceAll("\\", "/");
    debug(`invalidating context file: ${file}`);
    context.files.delete(file);
    context.programs = context.programs.filter((program) => !program.getSourceFiles().some((sourceFile) => sourceFile.fileName === file));
    context.projects.clear();
};

export const globalContext: TscContext = createContext();
