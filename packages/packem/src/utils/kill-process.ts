/**
 * Modified copy of https://github.com/egoist/tsup/blob/main/src/index.ts#L46-L69
 *
 * MIT License
 * Copyright (c) 2021 EGOIST
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import kill from "tree-kill";

import type { KillSignal } from "../types";

/**
 * tree-kill use `taskkill` command on Windows to kill the process,
 * it may return 128 as exit code when the process has already exited.
 * @see https://github.com/egoist/tsup/issues/976
 */
const isTaskKillCmdProcessNotFoundError = (error: Error) =>
    process.platform === "win32"
    && "cmd" in error
    && "code" in error
    && typeof error.cmd === "string"
    && error.cmd.startsWith("taskkill")
    && error.code === 128;

/**
 * Terminates a process with the specified signal.
 * @param params The parameters object
 * @param params.pid Process ID to terminate
 * @param params.signal Signal to send ('SIGTERM', 'SIGKILL', etc.)
 * @throws {Error} If pid is invalid or process termination fails
 * @returns Resolves when process is terminated
 */
const killProcess = async ({ pid, signal }: { pid: number; signal: KillSignal }): Promise<void> =>
    await new Promise<void>((resolve, reject) => {
        if (!Number.isInteger(pid) || pid <= 0) {
            reject(new Error("Invalid process ID"));

            return;
        }

        kill(pid, signal, (error) => {
            if (error && !isTaskKillCmdProcessNotFoundError(error)) {
                reject(error);

                return;
            }

            resolve();
        });
    });

export default killProcess;
