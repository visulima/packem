/**
 * Shape of a single log entry passed to the logger methods: an arbitrary record
 * of metadata that must include a `message`.
 */
type LogEntry = { [key: string]: unknown; message: string };

/**
 * Interface for a Rollup-compatible logger that wraps Rollup's native logging methods
 */
export interface RollupLogger {
    debug: (log: LogEntry) => void;
    error: (log: LogEntry) => void;
    info: (log: LogEntry) => void;
    warn: (log: LogEntry) => void;
}

/**
 * Creates a Rollup-compatible logger that wraps Rollup's native logging methods.
 *
 * This logger automatically adds the plugin name to all log entries and provides
 * a consistent interface for logging across packem plugins.
 * @param context Rollup plugin context with logging methods
 * @param context.debug Debug logging method from Rollup plugin context
 * @param context.error Error logging method from Rollup plugin context
 * @param context.info Info logging method from Rollup plugin context
 * @param context.warn Warning logging method from Rollup plugin context
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
        debug: (log: LogEntry) => void;
        error: (log: LogEntry) => void;
        info: (log: LogEntry) => void;
        warn: (log: LogEntry) => void;
    },
    pluginName: string,
): RollupLogger => {
    return {
        debug: (log: LogEntry) => {
            context.debug({ ...log, plugin: pluginName });
        },
        error: (log: LogEntry) => {
            context.error({ ...log, plugin: pluginName });
        },
        info: (log: LogEntry) => {
            context.info({ ...log, plugin: pluginName });
        },
        warn: (log: LogEntry) => {
            context.warn({ ...log, plugin: pluginName });
        },
    };
};
