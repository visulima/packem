// eslint-disable-next-line import/no-extraneous-dependencies
import kill from "tree-kill";

import type { KillSignal } from "../types";

/**
 * tree-kill use `taskkill` command on Windows to kill the process,
 * it may return 128 as exit code when the process has already exited.
 * @see https://github.com/egoist/tsup/issues/976
 */
const isTaskkillCmdProcessNotFoundError = (error: Error) =>
    process.platform === "win32" &&
    "cmd" in error &&
    "code" in error &&
    typeof error.cmd === "string" &&
    error.cmd.startsWith("taskkill") &&
    error.code === 128;

const killProcess = async ({ pid, signal }: { pid: number; signal: KillSignal }): Promise<void> =>
    await new Promise<void>((resolve, reject) => {
        kill(pid, signal, (error) => {
            if (error && !isTaskkillCmdProcessNotFoundError(error)) {
                reject(error);
                return;
            }
            resolve();
        });
    });

export default killProcess;
