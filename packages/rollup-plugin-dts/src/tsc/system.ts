import { createDebug } from "obug";
import ts from "typescript";

const debug = createDebug("rollup-plugin-dts:tsc-system");

/**
 * A system that writes files to both memory and disk. It will try read files
 * from memory firstly and fallback to disk if not found.
 */
// Collect every ancestor directory of a file path (using POSIX-normalized separators so
// the membership test in `directoryExists` is consistent regardless of platform).
const ancestorDirectories = (filePath: string): string[] => {
    const normalized = filePath.replaceAll("\\", "/");
    const directories: string[] = [];
    let directory = normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));

    while (directory.includes("/")) {
        directories.push(directory);

        directory = directory.slice(0, directory.lastIndexOf("/"));
    }

    if (directory) {
        directories.push(directory);
    }

    return directories;
};

// Maintain a Set of known in-memory directories incrementally instead of scanning every
// key on each `directoryExists` call (TS calls it constantly — O(files) per call is a real
// cost). Storing exact directory paths and matching by membership also guards against the
// prefix bug where `directoryExists("/a/bar")` previously matched `/a/barn/x.d.ts`.
const createSystem = (files: Map<string, string>, persistToDisk: boolean): ts.System => {
    const knownDirectories = new Set<string>();

    for (const filePath of files.keys()) {
        for (const directory of ancestorDirectories(filePath)) {
            knownDirectories.add(directory);
        }
    }

    const trackDirectories = (filePath: string) => {
        for (const directory of ancestorDirectories(filePath)) {
            knownDirectories.add(directory);
        }
    };

    return {
        ...ts.sys,

        deleteFile(fileName, ...arguments_) {
            files.delete(fileName);

            if (persistToDisk) {
                ts.sys.deleteFile?.(fileName, ...arguments_);
            }
        },

        directoryExists(directory) {
            if (knownDirectories.has(directory.replaceAll("\\", "/"))) {
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
        // eslint-disable-next-line no-secrets/no-secrets -- Source attribution URL is intentional
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
            trackDirectories(path);

            if (persistToDisk) {
                ts.sys.writeFile(path, data, ...arguments_);
            }
        },
    };
};

export const createFsSystem = (files: Map<string, string>): ts.System => createSystem(files, true);

// A system that only writes files to memory. It will read files from both
// memory and disk.
export const createMemorySystem = (files: Map<string, string>): ts.System => createSystem(files, false);
