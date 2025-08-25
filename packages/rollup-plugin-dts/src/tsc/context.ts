import Debug from "debug";
import type ts from "typescript";

const debug = Debug("rolldown-plugin-dts:tsc-context");

export interface TscContext {
    files: Map<string, string>;
    programs: ts.Program[];
}

export function createContext(): TscContext {
    const programs: ts.Program[] = [];
    const files = new Map<string, string>();

    return { files, programs };
}

export function invalidateContextFile(context: TscContext, file: string): void {
    debug(`invalidating context file: ${file}`);
    context.files.delete(file);
    context.programs = context.programs.filter((program) => !program
        .getSourceFiles()
        .some((sourceFile) => sourceFile.fileName === file));
}

export const globalContext: TscContext = createContext();
