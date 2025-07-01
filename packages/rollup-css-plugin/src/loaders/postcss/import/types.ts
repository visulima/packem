import type { AcceptedPlugin, AtRule, ChildNode, Warning } from "postcss";

import type { ImportResolve } from "./import-resolve";

export type Condition = {
    layer?: string;
    media?: string;
    scope?: string;
    supports?: string;
};

/** `@import` handler options */
export interface ImportOptions {
    /**
     * Aliases for import paths.
     * Overrides the global `alias` option.
     * - ex.: `{"foo":"bar"}`
     */
    alias: Record<string, string>;

    /**
     * On the debug mode, the file path will be added as a comment in the CSS output.
     */
    debug?: boolean;

    /**
     * Import files ending with these extensions.
     * Overrides the global `extensions` option.
     * @default [".css", ".pcss", ".postcss", ".sss"]
     */
    extensions: string[];

    /**
     * Only transform imports for which the test function returns `true`. Imports for which the test function returns `false` will be left as is. The function gets the path to import as an
     * argument and should return a boolean.
     * @default () => true
     */
    filter?: (id: string) => boolean;

    /**
     * You can overwrite the default loading way by setting this option. This function gets `(filename, importOptions)` arguments and returns content or promised content.
     */
    load: (filename: string, importOptions: ImportOptions) => Promise<string> | string;

    /**
     * A list of plugins for PostCSS,
     * which are used before plugins loaded from PostCSS config file, if any
     */
    plugins: AcceptedPlugin[];

    /**
     * Provide custom resolver for imports
     * in place of the default one
     */
    resolve: ImportResolve;

    /**
     * By default, similar files (based on the same content) are being skipped. It's to optimize output and skip similar files like `normalize.css` for example. If this behavior is not what you
     * want, just set this option to false to disable it.
     * @default true
     */
    skipDuplicates?: boolean | undefined;

    /**
     * By default, css-import warns when an empty file is imported.
     * Set this option to false to disable this warning.
     * @default true
     */
    warnOnEmpty?: boolean;
}

export type ImportStatement = {
    conditions: Condition[];
    from: string[];
    fullUri: string;
    importingNode: AtRule | undefined;
    node: AtRule;
    parent?: Statement;
    stylesheet?: Stylesheet;
    type: "import";
    uri: string;
};

export type NodesStatement = {
    conditions: Condition[];
    from: string[];
    importingNode: AtRule | undefined;
    nodes: ChildNode[];
    parent?: Statement;
    type: "nodes";
};

export type PreImportStatement = {
    conditions: Condition[];
    from: string[];
    importingNode: AtRule | undefined;
    node: ChildNode;
    parent?: Statement;
    type: "pre-import";
};

export type State = { hashFiles: Record<string, Record<string, boolean>>; importedFiles: Record<string, Record<string, boolean>> };

export type Statement = ImportStatement | NodesStatement | PreImportStatement | Warning;

export type Stylesheet = {
    charset?: AtRule;
    statements: Statement[];
};
