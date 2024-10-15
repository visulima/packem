import type { AcceptedPlugin, ChildNode, Node, Root } from "postcss";

import type { ImportResolve } from "./import-resolve";

export type Statement = {
    children?: any[];
    conditions: any[];
    from: string | undefined;
    fullUri?: string;
    node?: Root | ChildNode;
    nodes?: (Root | ChildNode)[];
    parent?: any;
    type: "charset" | "import" | "nodes" | "warning";
    uri?: string;
};

export type ImportStatement = {
    children?: any[];
    conditions: any[];
    from: string;
    fullUri?: string;
    node: Node;
    type: "import";
    uri: string;
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
     *
     * @default () => true
     */
    filter?: (id: string) => boolean;
    /**
     * You can overwrite the default loading way by setting this option. This function gets `(filename, importOptions)` arguments and returns content or promised content.
     */
    load: (filename: string, importOptions: ImportOptions) => string | Promise<string>;
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
     * Define the root where to resolve path (eg: place where `node_modules` are). Should not be used that much.
     *
     * _Note: nested @import will additionally benefit of the relative dirname of imported files._
     */
    root: string;
    /**
     * By default, similar files (based on the same content) are being skipped. It's to optimize output and skip similar files like `normalize.css` for example. If this behavior is not what you
     * want, just set this option to false to disable it.
     *
     * @default true
     */
    skipDuplicates?: boolean | undefined;
    /**
     * By default, postcss-import warns when an empty file is imported.
     * Set this option to false to disable this warning.
     *
     * @default true
     */
    warnOnEmpty: boolean;
}

export type State = { hashFiles: Record<string, Record<string, boolean>>; importedFiles: Record<string, Record<string, boolean>> };
