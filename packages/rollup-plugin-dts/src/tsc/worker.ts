import process from "node:process";

import { createBirpc } from "birpc";

import { tscEmit } from "./index.js";

const functions: { tscEmit: typeof tscEmit } = { tscEmit };

type TscFunctions = typeof functions;
export type { TscFunctions as default };

createBirpc(functions, {
    on: (function_) => process.on("message", function_),
    post: (data) => process.send!(data),
});
