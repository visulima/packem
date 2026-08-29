import type { Warning } from "postcss";

import type { ImportStatement, NodesStatement, PreImportStatement, Statement } from "../types";

export const isWarning = (statement: Statement): statement is Warning => statement.type === "warning";

export const isNodesStatement = (statement: Statement): statement is NodesStatement => statement.type === "nodes";

export const isImportStatement = (statement: Statement): statement is ImportStatement => statement.type === "import";

export const isPreImportStatement = (statement: Statement): statement is PreImportStatement => statement.type === "pre-import";
