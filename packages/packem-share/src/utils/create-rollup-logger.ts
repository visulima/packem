/**
 * Interface for a Rollup-compatible logger that wraps Rollup's native logging methods
 */
export interface RollupLogger {
    debug: (log: { [key: string]: unknown; message: string }) => void;
    error: (log: { [key: string]: unknown; message: string }) => void;
    info: (log: { [key: string]: unknown; message: string }) => void;
    warn: (log: { [key: string]: unknown; message: string }) => void;
}

/**
 * Creates a Rollup-compatible logger that wraps Rollup's native logging methods.
 *
 * This logger automatically adds the plugin name to all log entries and provides
 * a consistent interface for logging across packem plugins.
 * @param context Rollup plugin context with logging methods
 * @param pluginName Name of the plugin for log identification
 * @returns RollupLogger instance
 * @example
 * ```typescript
 * // In a Rollup plugin
 * const logger = createRollupLogger(this, "my-plugin");
 *
 * logger.info({ message: "Processing file", file: "example.js" });
 * // Logs: { message: "Processing file", file: "example.js", plugin: "my-plugin" }
 * ```
 */
export const createRollupLogger = (
    context: {
        debug: (log: { [key: string]: unknown; message: string }) => void;
        error: (log: { [key: string]: unknown; message: string }) => void;
        info: (log: { [key: string]: unknown; message: string }) => void;
        warn: (log: { [key: string]: unknown; message: string }) => void;
    },
    pluginName: string,
): RollupLogger => {
    return {
        debug: (log: { [key: string]: unknown; message: string }) => {
            context.debug({ ...log, plugin: pluginName });
        },
        error: (log: { [key: string]: unknown; message: string }) => {
            context.error({ ...log, plugin: pluginName });
        },
        info: (log: { [key: string]: unknown; message: string }) => {
            context.info({ ...log, plugin: pluginName });
        },
        warn: (log: { [key: string]: unknown; message: string }) => {
            context.warn({ ...log, plugin: pluginName });
        },
    };
};
