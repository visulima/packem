import type { ImportStatement, NodesStatement, Statement, PreImportStatement } from "../types";
import { Warning } from "postcss";

export const isWarning = (stmt: Statement): stmt is Warning => {
    return stmt.type === "warning";
};

export const isNodesStatement = (stmt: Statement): stmt is NodesStatement => {
    return stmt.type === "nodes";
};

export const isImportStatement = (stmt: Statement): stmt is ImportStatement => {
    return stmt.type === "import";
};

export const isPreImportStatement = (stmt: Statement): stmt is PreImportStatement => {
    return stmt.type === "pre-import";
};
