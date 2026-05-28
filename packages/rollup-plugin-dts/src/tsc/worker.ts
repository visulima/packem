import process from "node:process";

import { createBirpc } from "birpc";

import { tscEmit } from "./index.js";

const functions: { tscEmit: typeof tscEmit } = { tscEmit };

createBirpc(functions, {
    on: (function_) => process.on("message", function_),
    post: (data) => {
        if (process.send) {
            process.send(data);
        }
    },
});

export type TscFunctions = typeof functions;
