import { cyan, yellow } from "@visulima/colorize";
import type { RollupError } from "rollup";

/**
 * The stack string usually contains a copy of the message at the start of the stack.
 * If the stack starts with the message, we remove it and just return the stack trace
 * portion. Otherwise, the original stack trace is used.
 */
const extractStack = (error: RollupError): string | undefined => {
    const { message, name = "Error", stack } = error;

    // If we don't have a stack, not much we can do.
    if (!stack) {
        return undefined;
    }

    const expectedPrefix = `${name}: ${message}\n`;

    if (stack.startsWith(expectedPrefix)) {
        return stack.slice(expectedPrefix.length);
    }

    return stack;
};
/**
 * Esbuild code frames have newlines at the start and end of the frame, rollup doesn't
 * This function normalizes the frame to match the esbuild format which has more pleasing padding
 */
const normalizeCodeFrame = (frame: string): string => {
    const trimmedPadding = frame.replaceAll(/^\n|\n$/g, "");

    return `\n${trimmedPadding}\n`;
};

const enhanceRollupError = (error: RollupError): void => {
    const stackOnly = extractStack(error);

    let message = (error.plugin ? `[${error.plugin}] ` : "") + error.message;

    if (error.id) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        message += `\nfile: ${cyan(error.id + (error.loc ? ":" + error.loc.line + ":" + error.loc.column : ""))}`;
    }

    if (error.frame) {
        message += `\n` + yellow(normalizeCodeFrame(error.frame));
    }

    // eslint-disable-next-line no-param-reassign
    error.message = message;

    // We are rebuilding the stack trace to include the more detailed message at the top.
    // Previously this code was relying on mutating e.message changing the generated stack
    // when it was accessed, but we don't have any guarantees that the error we are working
    // with hasn't already had its stack accessed before we get here.
    if (stackOnly !== undefined) {
        // eslint-disable-next-line no-param-reassign
        error.stack = `${error.message}\n${stackOnly}`;
    }
};

export default enhanceRollupError;
