import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface TemporaryDirectoryOptions {
    /**
     * Directory name prefix for the created temporary directory.
     * @default "packem"
     */
    prefix?: string;
}

/**
 * Create a unique temporary directory and return its absolute path.
 *
 * Native replacement for `tempy`'s `temporaryDirectory()` built on
 * `fs.mkdtempSync`. The path is resolved with `realpathSync` so that
 * symlinked temp roots (e.g. macOS `/var` -> `/private/var`) match the
 * paths reported by tools that canonicalize their working directory.
 */
const temporaryDirectory = (options: TemporaryDirectoryOptions = {}): string => {
    const prefix = options.prefix ?? "packem";

    return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
};

export type { TemporaryDirectoryOptions };

export default temporaryDirectory;
