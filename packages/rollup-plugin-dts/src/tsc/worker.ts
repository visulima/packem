import process from "node:process";

import { tscEmit } from "./index.js";
import type { TscResult, WorkerRequest, WorkerResponse } from "./types.js";

// This module is a fork target, not a public entry: it exports nothing, so its emitted
// `.d.ts` stays empty instead of inlining TypeScript's entire type surface (~500 KB) into
// the published package. The message types live in `./types.ts`, which the plugin imports.
//
// A single `tscEmit` call is the entire protocol, so a full RPC library is more machinery
// than the job needs: every message is a request keyed by an incrementing id, and every
// reply carries that id back.
//
// `tscEmit` reports compiler diagnostics as `{ error }`, but it still *throws* for
// structural failures (an unloadable root file, a missing project reference). An uncaught
// throw here would kill the worker and leave the parent awaiting a reply that never
// arrives, so every failure is funnelled back over the same channel as a normal response.
process.on("message", (request: WorkerRequest) => {
    let result: TscResult;

    try {
        result = tscEmit(request.options);
    } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
    }

    const response: WorkerResponse = { id: request.id, result };

    process.send?.(response);
});
