import type { Warning } from "postcss";

import type { ImportStatement, NodesStatement, PreImportStatement,Statement } from "../types";

export const isWarning = (stmt: Statement): stmt is Warning => stmt.type === "warning";

export const isNodesStatement = (stmt: Statement): stmt is NodesStatement => stmt.type === "nodes";

export const isImportStatement = (stmt: Statement): stmt is ImportStatement => stmt.type === "import";

export const isPreImportStatement = (stmt: Statement): stmt is PreImportStatement => stmt.type === "pre-import";
