/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context, DeclarationReflection } from "typedoc";
import { Converter } from "typedoc";

/**
 * Checks if a given string is wrapped in square brackets.
 *
 * @param value - The string to check.
 * @returns `true` if the string is wrapped in square brackets, otherwise `false`.
 */
const isWrappedInSquareBrackets = (value: string): boolean => value.startsWith("[") && value.endsWith("]");

/**
 * Handles the `EVENT_CREATE_DECLARATION` event of the TypeDoc converter.
 * Renames reflections with `Symbol.*` definitions to the JSDoc style.
 *
 * @returns A function that processes reflections during the event.
 */
const onEventCreateDeclaration =
    (): ((context: Context, reflection: DeclarationReflection) => void) =>
    (context: Context, reflection: DeclarationReflection): void => {
        if (!isWrappedInSquareBrackets(reflection.name)) {
            return;
        }

        const symbolName = reflection.name.slice(1, -1);

        if (Symbol[symbolName as keyof typeof Symbol]) {
            reflection.name = `Symbol.${symbolName}`;
        } else {
            const symbol = context.project.getSymbolFromReflection(reflection);

            if (symbol?.declarations?.[0]) {
                context.logger.warn("Non-symbol wrapped in square brackets", symbol.declarations[0]);
            }
        }
    };

/**
 * The `typedoc-plugin-symbol-fixer` plugin renames `Symbol.*` definitions to use the JSDoc style.
 *
 * Examples:
 * - Typedoc: `[iterator]() → Iterator`
 * - JSDoc: `Symbol.iterator() → Iterator`
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_CREATE_DECLARATION, onEventCreateDeclaration());
};
