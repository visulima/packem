import process from "node:process";

import { createBirpc } from "birpc";

import { tscEmit } from "./index.ts";

const functions: { tscEmit: typeof tscEmit } = { tscEmit };

export type TscFunctions = typeof functions;

createBirpc(functions, {
    on: (function_) => process.on("message", function_),
    post: (data) => process.send!(data),
});
