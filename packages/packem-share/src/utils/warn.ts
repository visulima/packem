// Generic context type to avoid circular dependencies
interface WarningContext {
    warnings: Set<string>;
}

const warn = (context: WarningContext, message: string): void => {
    if (context.warnings.has(message)) {
        return;
    }

    context.warnings.add(message);
};

export default warn;
