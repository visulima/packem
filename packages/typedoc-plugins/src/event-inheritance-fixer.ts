/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, Context, DeclarationReflection, Reflection } from "typedoc";
import { Converter, ReferenceType, ReflectionKind } from "typedoc";

/**
 * Finds all derived classes and interfaces from the specified base reflection. It traverses the whole inheritance chain.
 * If the base reflection is not extended or implemented by any other reflection, an empty array is returned.
 *
 * @param reflection - The base reflection from which the derived ones will be searched.
 * @returns An array of derived reflections.
 */
const getDerivedReflections = (reflection: Reflection): Reflection[] => {
    const extendedBy = reflection.extendedBy || [];
    const implementedBy = reflection.implementedBy || [];

    return [...extendedBy, ...implementedBy]
        .filter((entry) => entry.reflection)
        .flatMap((entry) => {
            const derivedReflection = entry.reflection!;
            return [derivedReflection, ...getDerivedReflections(derivedReflection)];
        });
};

/**
 * Finds all parent classes from the specified base reflection. It traverses the whole inheritance chain.
 * If the base reflection does not extend any other class or interface, an empty array is returned.
 *
 * @param reflection - The base reflection from which the parent classes will be searched.
 * @returns An array of parent reflections.
 */
const getParentClasses = (reflection: Reflection): Reflection[] => {
    const extendedTypes = reflection.extendedTypes || [];

    return extendedTypes
        .filter((entry) => {
            // Cover: `class extends Mixin( BaseClass )`.
            if (entry.type === "intersection") {
                return entry.types.some((type) => type.reflection);
            }
            return Boolean(entry.reflection);
        })
        .flatMap((entry) => {
            if (entry.type === "intersection") {
                const parents = entry.types.filter((type) => type.reflection).map((type) => type.reflection!);

                return [...parents.flatMap((parent) => getParentClasses(parent)), ...parents];
            }

            const parentReflection = entry.reflection!;
            return [...getParentClasses(parentReflection), parentReflection];
        });
};

/**
 * Handles the `EVENT_END` event of the TypeDoc converter. Processes reflections to inherit events from parent classes or interfaces.
 *
 * @param context - The TypeDoc converter context.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
const onEventEnd = (context: Context): void => {
    // Event can be assigned as a child to a class or to an interface.
    const reflections = context.project.getReflectionsByKind(ReflectionKind.Class | ReflectionKind.Interface);

    for (const reflection of reflections) {
        // If a reflection does not contain any children, skip it.
        if (!reflection.children) {
            continue;
        }

        // Find all parents of the given reflection.
        const parentReflections = getParentClasses(reflection).filter(Boolean);

        // Collect all events from parent reflections to insert into the current reflection.
        const eventReflections = parentReflections
            .filter((parentReference) => parentReference.children)
            .flatMap((parentReference) => parentReference.children!.filter((child) => child.kindString === "Event"));

        if (eventReflections.length === 0) {
            continue;
        }

        // Find all derived classes and interfaces in the inheritance chain, including the current reflection.
        const derivedReflections = [reflection, ...getDerivedReflections(reflection)];

        // Insert inherited events into each derived reflection.
        for (const derivedReflection of derivedReflections) {
            for (const eventReflection of eventReflections) {
                // Skip if the derived reflection already has the event.
                const hasEvent = derivedReflection.children?.some((child) => child.kindString === "Event" && child.name === eventReflection.name);

                if (hasEvent) {
                    continue;
                }

                // Create and insert a new event reflection as a child of the derived reflection.
                const clonedEventReflection = context
                    .withScope(derivedReflection)
                    .createDeclarationReflection(ReflectionKind.ObjectLiteral, undefined, undefined, eventReflection.name) as DeclarationReflection;

                clonedEventReflection.kindString = "Event";

                if (eventReflection.comment) {
                    clonedEventReflection.comment = eventReflection.comment.clone();
                }

                clonedEventReflection.sources = [...eventReflection.sources];

                clonedEventReflection.inheritedFrom = ReferenceType.createResolvedReference(
                    `${eventReflection.parent!.name}.${eventReflection.name}`,
                    eventReflection,
                    context.project,
                );

                if (eventReflection.typeParameters) {
                    clonedEventReflection.typeParameters = [...eventReflection.typeParameters];
                }
            }
        }
    }
};

/**
 * The `typedoc-plugin-event-inheritance-fixer` takes care of inheriting events, which are not handled by TypeDoc by default.
 *
 * Events can be inherited from a class or from an interface. If a class or an interface fires an event, and it is a base for another class or
 * interface, then all events from the base reflection are copied and inserted into each derived reflection.
 *
 * The plugin also takes care of events specified in parent classes.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
