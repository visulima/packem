import type { Plugin, PluginContext, RenderedChunk } from "rollup";

import fixDtsDefaultCJSExports from "./isolated-declarations/utils/fix-dts-default-cjs-exports";

/**
 * Options for the `fixDtsDefaultCjsExportsPlugin`.
 */
export type FixDtsDefaultCjsExportsPluginOptions = {
    /**
     * A function to determine if a chunk should be processed by this plugin.
     * Defaults to processing .d.ts, .d.cts, or .d.mts files that are entry chunks and have exports.
     * @param info The Rollup RenderedChunk object.
     * @returns True if the chunk should be processed, false otherwise.
     */
    matcher?: (info: RenderedChunk) => boolean;
};

/**
 * A Rollup plugin to fix default exports in TypeScript declaration files (.d.ts)
 * to ensure they are CJS compatible (using `export = ...` and namespaces).
 * This is particularly useful for libraries that want to support both ESM and CJS consumers correctly.
 *
 * The plugin handles various scenarios:
 * - `export { MyClass as default };`
 * - `export { default } from 'some-module';`
 * - `export { name as default } from 'some-module';`
 * - `export default from 'some-module';` (an mlly quirk)
 * - Combinations with named exports (value and type exports), creating namespaces where appropriate.
 * - Pure type-only exports like `export { type Foo, type Bar };`
 * @param options Optional configuration for the plugin.
 * @returns The Rollup plugin object.
 */
export const fixDtsDefaultCjsExportsPlugin = (options: FixDtsDefaultCjsExportsPluginOptions = {}): Plugin => {
    const {
        matcher = (info: RenderedChunk) =>
            (info.type === "chunk" || info.type === "asset")
            && info.exports?.length > 0
            // We should process the file if it's a d.ts entry,
            // and allow the main plugin logic to decide if default exports need fixing
            // OR if it's a pure type-only export block (e.g., `export { type Foo, type Bar };`).
            && /\.d\.c?ts$/.test(info.fileName)
            && info.isEntry,
    } = options;

    return {
        name: "packem:fix-dts-default-cjs-exports-plugin",
        renderChunk(this: PluginContext, code: string, chunkInfo: RenderedChunk) {
            // eslint-disable-next-line no-secrets/no-secrets
            // Renamed `info` to `chunkInfo` to avoid confusion with the `info` object passed to fixDefaultCJSExports
            return matcher(chunkInfo)
                ? fixDtsDefaultCJSExports(code, { fileName: chunkInfo.fileName, imports: chunkInfo.imports }, { warn: this.warn })
                : undefined;
        },
    } satisfies Plugin;
};
