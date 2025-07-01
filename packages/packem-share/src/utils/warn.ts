// Generic context type to avoid circular dependencies
interface WarningContext {
    warnings: Set<string>;
}

/**
 * Adds a warning message to the context if it hasn't been added before.
 * @param context The warning context containing a warnings set
 * @param message The warning message to add
 */
const warn = (context: WarningContext, message: string): void => {
    if (context.warnings.has(message)) {
        return;
    }

    context.warnings.add(message);
};

export default warn;
