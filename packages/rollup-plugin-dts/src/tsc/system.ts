import { createDebug } from "obug";
import ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-system");

/**
 * A system that writes files to both memory and disk. It will try read files
 * from memory firstly and fallback to disk if not found.
 */
export const createFsSystem = (files: Map<string, string>): ts.System => {
    return {
        ...ts.sys,

        deleteFile(fileName, ...arguments_) {
            files.delete(fileName);
            ts.sys.deleteFile?.(fileName, ...arguments_);
        },

        // Copied from
        // https://github.com/microsoft/TypeScript-Website/blob/b0e9a5c0/packages/typescript-vfs/src/index.ts#L532C1-L534C8
        directoryExists(directory) {
            if ([...files.keys()].some((path) => path.startsWith(directory))) {
                return true;
            }

            return ts.sys.directoryExists(directory);
        },

        fileExists(fileName) {
            if (files.has(fileName)) {
                return true;
            }

            return ts.sys.fileExists(fileName);
        },

        readFile(fileName, ...arguments_) {
            if (files.has(fileName)) {
                return files.get(fileName);
            }

            return ts.sys.readFile(fileName, ...arguments_);
        },

        // Copied from
        // https://github.com/microsoft/TypeScript-Website/blob/b0e9a5c0/packages/typescript-vfs/src/index.ts#L571-L574
        resolvePath(path) {
            if (files.has(path)) {
                return path;
            }

            return ts.sys.resolvePath(path);
        },

        // Hide the output of tsc by default
        write(message: string): void {
            debug(message);
        },

        writeFile(path, data, ...arguments_) {
            files.set(path, data);
            ts.sys.writeFile(path, data, ...arguments_);
        },
    };
};

// A system that only writes files to memory. It will read files from both
// memory and disk.
export const createMemorySystem = (files: Map<string, string>): ts.System => {
    return {
        ...createFsSystem(files),

        deleteFile(fileName) {
            files.delete(fileName);
        },

        writeFile(path, data) {
            files.set(path, data);
        },
    };
};
