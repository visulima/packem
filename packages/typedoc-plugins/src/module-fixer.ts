/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context, DeclarationReflection } from "typedoc";
import { Converter, ReflectionKind, TypeScript } from "typedoc";

/**
 * Handles the `EVENT_CREATE_DECLARATION` event of the TypeDoc converter.
 * Reads the `@module` tag value from the JSDoc block and updates the module name of the reflection.
 *
 * @returns A function that processes reflections during the event.
 */
const onEventCreateDeclaration =
    (): ((context: Context, reflection: DeclarationReflection) => void) =>
    (context: Context, reflection: DeclarationReflection): void => {
        // Skip processing if the reflection is not a module.
        if (reflection.kind !== ReflectionKind.Module) {
            return;
        }

        const symbol = context.project.getSymbolFromReflection(reflection);

        // Handle empty files or cases where no symbol is associated with the reflection.
        if (!symbol) {
            return;
        }

        const node = symbol.declarations?.[0];

        // Ensure the node contains statements (i.e., it is a module).
        if (!node || !("statements" in node)) {
            return;
        }

        // Iterate over statements in the node.
        for (const statement of node.statements) {
            // Skip statements without JSDoc blocks.
            if (!Array.isArray((statement as any).jsDoc)) {
                continue;
            }

            // Iterate over JSDoc blocks to find a `@module` tag.
            for (const jsDocument of (statement as any).jsDoc) {
                const moduleTag = (jsDocument.tags || []).find((tag: any) => tag.tagName.originalKeywordKind === TypeScript.SyntaxKind.ModuleKeyword);

                // If a `@module` tag is found, update the module name.
                if (moduleTag) {
                    reflection.originalName = reflection.name;
                    reflection.name = moduleTag.comment || reflection.name;

                    // Exit after finding the desired tag.
                    return;
                }
            }
        }
    };

/**
 * The `typedoc-plugin-module-fixer` reads the module name specified in the `@module` tag name from JSDoc comments.
 *
 * For example:
 *
 *      @module package/file
 *
 * In this case, the name of the parsed module should be equal to "package/file".
 *
 * The plugin handles cases where import statements precede the `@module` tag in the file, which might cause
 * TypeDoc's built-in plugin to miss the module name.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_CREATE_DECLARATION, onEventCreateDeclaration());
};
