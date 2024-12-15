/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context } from "typedoc";
import { Converter, ReferenceReflection, ReflectionKind } from "typedoc";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 * Fixes augmented interfaces in the "index.ts" file by moving properties to the source file and replacing the duplicate with a reference.
 *
 * @param context - The TypeDoc converter context.
 */
const onEventEnd = (context: Context): void => {
    const reflections = context.project.getReflectionsByKind(ReflectionKind.Interface);

    for (const reflection of reflections) {
        // The name of the main module exported by a package.
        const moduleName = reflection.parent?.name.split("/").shift();

        if (!moduleName) {
            continue;
        }

        // Locate the interface reflection in the re-exported "index.ts" file.
        const interfaceToCopy = context.project.getChildByName([moduleName, reflection.name]);

        if (!interfaceToCopy?.children) {
            continue;
        }

        // Skip if the interface is already defined in the source file.
        if (reflection.id === interfaceToCopy.id) {
            continue;
        }

        // Copy properties from the extended interface in the "index.ts" file to the source interface.
        reflection.children = [...interfaceToCopy.children];
        reflection.groups = interfaceToCopy.groups?.slice();

        // Create a new reference reflection to replace the duplicate interface in "index.ts".
        const newReference = new ReferenceReflection(interfaceToCopy.name, reflection, interfaceToCopy.parent);

        newReference.kindString = "Reference";
        newReference.sources = interfaceToCopy.sources;

        // Use the same identifier as the original extended interface.
        newReference.id = interfaceToCopy.id;

        context.withScope(newReference.parent!).addChild(newReference);

        // Temporarily store the unique symbol from the extended interface.
        const oldSymbol = context.project.reflectionIdToSymbolMap.get(interfaceToCopy.id);

        // Remove the duplicate interface.
        context.project.removeReflection(interfaceToCopy);

        // Register the new reference reflection with the old symbol to maintain type references.
        context.project.registerReflection(newReference, oldSymbol);
    }
};

/**
 * The `typedoc-plugin-interface-augmentation-fixer` attempts to fix interfaces that are extended (augmented) from another module in a
 * re-exported "index.ts" file. Typedoc may incorrectly add properties to the interface in the "index.ts" file instead of the source file,
 * leading to duplicate interface definitions in the output. This plugin:
 *
 * - Copies the externally added properties to the source definition.
 * - Replaces the duplicated interface with a reference to the source definition.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
